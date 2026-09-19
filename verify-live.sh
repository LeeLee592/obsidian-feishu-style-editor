#!/bin/bash
# Live end-to-end verification for the Feishu Style Editor plugin.
#
# Drives the running Obsidian app through its CLI and Chrome DevTools Protocol.
#
# ## Focus policy
#
# This script does NOT fight the user for the window. CodeMirror's input
# pipeline only runs for trusted browser events, so the tests that need a
# real keystroke are grouped into one short foreground phase (~10s): the
# script notes which application was in front, announces the switch, brings
# Obsidian forward once, runs those tests, then restores the previous
# application. Everything else runs with Obsidian in the background.
#
# Two other environment facts, learned the hard way:
#   * the CLI hangs silently -> every call is wrapped in an alarm;
#   * a live user can edit the same note mid-run -> assertions are relative
#     and preconditions are re-checked, never assumed.
#
# Requirements: Obsidian running, plugin deployed and enabled in the target
# vault. Run `node deploy-test.mjs` first.
#
# Usage:  ./verify-live.sh [vault-name] [--no-foreground]
set -u

VAULT="${1:-Test}"
FOREGROUND=1
for arg in "$@"; do
	[ "$arg" = "--no-foreground" ] && FOREGROUND=0
done

NOTE="fse-check-0.md"
SECTION=0
PASS=0
FAIL=0
SKIP=0

oc() {
	perl -e 'alarm 25; exec @ARGV' obsidian "$@" 2>&1
}

ev() {
	oc eval code="$1"
}

# Flattens pretty-printed CLI JSON, drops the "=> " prefix, removes the space
# JSON printers add after ':' and ','.
flat() {
	tr -d '\n\t' | sed 's/^[[:space:]]*//; s/^=>[[:space:]]*//; s/[[:space:]]*$//; s/  */ /g; s/: /:/g; s/, /,/g'
}

check() {
	local actual
	actual="$(printf '%s' "$3" | flat)"
	if printf '%s' "$actual" | grep -qF -- "$2"; then
		printf '  PASS  %s\n' "$1"
		PASS=$((PASS + 1))
	else
		printf '  FAIL  %s\n        expected: %s\n        got:      %s\n' \
			"$1" "$2" "$actual"
		FAIL=$((FAIL + 1))
	fi
}

skip() {
	printf '  SKIP  %s (%s)\n' "$1" "$2"
	SKIP=$((SKIP + 1))
}

frontmost_name() {
	lsappinfo info -only name "$(lsappinfo front)" 2>/dev/null | sed 's/.*=//; s/"//g'
}

# ---- focus helpers (no `w.show()` / `w.focus()` anywhere: those activate the
# ---- whole application and that is what used to steal the user's window) ----

# focus_editor — makes the note's editor the focused editor and waits until
# CodeMirror agrees. The window is left exactly where it is.
focus_editor() {
	local path="${1:-$NOTE}"
	local out
	for _ in 1 2 3; do
		out="$(ev "(async () => {
			const sleep = ms => new Promise(r => setTimeout(r, ms));
			const l = app.workspace.getLeavesOfType('markdown').find(x => x.view.file && x.view.file.path === '$path');
			if (!l) return 'noleaf';
			app.workspace.setActiveLeaf(l, { focus: true });
			for (let i = 0; i < 15; i++) {
				await sleep(100);
				const cm = l.view.editor.cm;
				cm.focus();
				if (cm.hasFocus) return 'focused';
			}
			return 'unfocused';
		})()")"
		printf '%s' "$out" | flat | grep -qx focused && return 0
	done
	return 1
}

# real_key — dispatches a trusted key event through the OS keyboard queue.
# Only correct while Obsidian is frontmost, which is exactly what the
# foreground phase arranges.
real_key() {
	local k="$1" c="$2" kc="$3" t="${4:-}"
	local p="{\"type\":\"keyDown\",\"key\":\"$k\",\"code\":\"$c\",\"windowsVirtualKeyCode\":$kc,\"nativeVirtualKeyCode\":$kc,\"modifiers\":0"
	if [ -n "$t" ]; then p="$p,\"text\":\"$t\",\"unmodifiedText\":\"$t\""; fi
	p="$p}"
	oc dev:cdp method=Input.dispatchKeyEvent params="$p" >/dev/null
	sleep 0.4
}

# dom_key — dispatches a synthetic key event into the editor's own DOM. Enough
# for keymap-driven behaviour (arrow keys, Enter, Escape); it cannot drive the
# input handler, which only sees trusted events.
dom_key() {
	local k="$1" c="$2" kc="$3"
	ev "(async () => {
		const sleep = ms => new Promise(r => setTimeout(r, ms));
		const l = app.workspace.getLeavesOfType('markdown').find(x => x.view.file && x.view.file.path === '$NOTE');
		if (!l) return 'noleaf';
		const cm = l.view.editor.cm;
		cm.focus();
		cm.contentDOM.dispatchEvent(new KeyboardEvent('keydown', { key: '$k', code: '$c', keyCode: $kc, which: $kc, bubbles: true, cancelable: true }));
		await sleep(120);
		return 'ok';
	})()" >/dev/null
	sleep 0.3
}

# Prepares a fresh note and leaves the caret where <line>:<col> asks.
#
# Each section gets its own note and its own editor leaf: reopening the same
# file in the same leaf repeatedly leaves the editor view in a state where the
# input handler no longer fires, which made later sections fail for reasons
# that had nothing to do with the plugin.
setup_note() {
	# setup_note <content-with-\n-escapes> <line> <col>
	NOTE="fse-check-$SECTION.md"
	ev "(async () => {
		const sleep = ms => new Promise(r => setTimeout(r, ms));
		const f = app.vault.getAbstractFileByPath('$NOTE') || await app.vault.create('$NOTE', '');
		await app.vault.modify(f, '$1');
		const leaf = app.workspace.getLeaf('tab');
		await leaf.openFile(f, { state: { mode: 'source' } });
		app.workspace.setActiveLeaf(leaf, { focus: true });
		const cm = leaf.view.editor.cm;
		cm.focus();
		const line = cm.state.doc.line(Math.min(Math.max($2, 1), cm.state.doc.lines));
		cm.dispatch({ selection: { anchor: line.from + $3 } });
		await sleep(250);
		return 'ok';
	})()" >/dev/null
	focus_editor "$NOTE" || true
}

# Drops the leaf a section used, so later sections start clean.
close_section() {
	ev "(async () => {
		const leaves = app.workspace.getLeavesOfType('markdown').filter(l => l.view.file && l.view.file.path === '$NOTE');
		for (const l of leaves) l.detach();
		const f = app.vault.getAbstractFileByPath('$NOTE');
		if (f) await app.vault.delete(f);
		return 'ok';
	})()" >/dev/null
}

# Opens the slash menu with a trusted key event and reports whether it worked.
slash_and_check() {
	real_key / Slash 191 /
	ev "(() => JSON.stringify({ ok: !![...document.querySelectorAll('.fse-popup')].find(x => getComputedStyle(x).display !== 'none' && x.querySelectorAll('.fse-popup-item').length) }))()" \
		| flat
}

state() {
	ev "(() => {
		const leaf = app.workspace.getLeavesOfType('markdown').find(l => l.view.file && l.view.file.path === '$NOTE');
		if (!leaf) return JSON.stringify({ error: 'note not open' });
		const cm = leaf.view.editor.cm;
		const all = [...document.querySelectorAll('.fse-popup')];
		const p = all.find(x => getComputedStyle(x).display !== 'none' && x.querySelectorAll('.fse-popup-item').length)
			|| all.find(x => x.querySelectorAll('.fse-popup-item').length);
		const vis = p ? getComputedStyle(p).display !== 'none' : false;
		const line = cm.state.doc.lineAt(cm.state.selection.main.head);
		return JSON.stringify({
			vault: app.vault.getName(),
			focused: cm.hasFocus,
			line: line.number,
			lineCount: cm.state.doc.lines,
			lineText: line.text,
			caretCol: cm.state.selection.main.head - line.from,
			menu: vis,
			scope: vis ? (p.classList.contains('fse-popup-toolbar') ? 'toolbar' : 'list') : null,
			items: vis ? [...p.querySelectorAll('.fse-popup-item')].map(el => {
				const label = el.querySelector('.fse-popup-item-label');
				const button = el.querySelector('.fse-popup-item-button');
				return label ? label.textContent : (button ? button.getAttribute('aria-label') : null);
			}).filter(Boolean) : [],
			active: vis ? (p.querySelector('.is-active .fse-popup-item-label') || {}).textContent : null,
		});
	})()"
}

# ============================================================================
# Phase 1 — foreground: the only part that needs a trusted keystroke
# ============================================================================
PREV_APP="$(frontmost_name)"
echo "Feishu Style Editor — live verification (vault: $VAULT)"
echo

FOREGROUND_OK=1
if [ "$FOREGROUND" -eq 1 ]; then
	echo "Bringing Obsidian to the front for about 10 seconds to send real"
	echo "keystrokes; front was: ${PREV_APP:-unknown}"
	open -a Obsidian >/dev/null 2>&1
	sleep 1.5
	if [ "$(frontmost_name)" != "Obsidian" ]; then
		FOREGROUND_OK=0
		echo "  WARN  could not bring Obsidian forward; keystroke tests will be skipped"
	fi
else
	FOREGROUND_OK=0
	echo "(--no-foreground: keystroke tests will be skipped)"
fi

if [ "$FOREGROUND_OK" -eq 1 ]; then
	echo
	echo "1. slash menu: open, filter, apply"
SECTION=1
	setup_note 'alpha\nbeta\n' 3 0
	R="$(slash_and_check)"
	if printf '%s' "$R" | grep -q '"ok":true'; then
		PASS=$((PASS + 1))
		printf '  PASS  a typed slash opens the block menu\n'
	else
		FAIL=$((FAIL + 1))
		printf '  FAIL  a typed slash opens the block menu\n        got: %s\n' "$R"
	fi
	check "block list is complete" '"Table"' "$(state)"
	real_key q KeyQ 81 q
	real_key u KeyU 85 u
	real_key o KeyO 79 o
	FILTERED="$(state)"
check "typing narrows the menu" '"active":"Quote"' "$FILTERED"
check "the query matched the quote entries" '"Quote with source"' "$FILTERED"
	real_key Enter Enter 13
	S="$(state)"
	check "Enter turns the line into a quote" '"lineText":"> "' "$S"
	check "caret sits inside the block" '"caretCol":2' "$S"

	echo
	echo "2. escape retracts the slash"
SECTION=2
	setup_note 'alpha\n' 2 0
	slash_and_check >/dev/null
	real_key Escape Escape 27
	S="$(state)"
	check "slash removed on escape" '"lineText":""' "$S"
	check "menu closed" '"menu":false' "$S"

	echo
	echo "3. arrow keys drive the open menu"
SECTION=3
	setup_note 'alpha\n' 2 0
	slash_and_check >/dev/null
	dom_key ArrowDown ArrowDown 40
	check "ArrowDown selects the second block" '"active":"Heading 1"' "$(state)"
	dom_key ArrowUp ArrowUp 38
	check "ArrowUp wraps back to the first block" '"active":"Text"' "$(state)"
	dom_key Escape Escape 27
else
	skip "slash menu keystroke tests" "no foreground window"
	skip "escape retraction" "no foreground window"
	skip "arrow key navigation" "no foreground window"
fi
close_section

# restore the user's window before the background phase
if [ "$FOREGROUND" -eq 1 ] && [ -n "${PREV_APP:-}" ] && [ "$PREV_APP" != "Obsidian" ]; then
	open -a "$PREV_APP" >/dev/null 2>&1
	echo
	echo "restored the front window to: $PREV_APP"
fi

# ============================================================================
# Phase 2 — background: everything that needs no trusted keystroke
# ============================================================================
echo
echo "4. plugin state (background)"
SECTION=4
setup_note 'plugin probe\n' 1 0
check "the plugin answers in this vault" '"vault":"Test"' "$(state)"
close_section
check "one shared popup, no leak" '"popups":1' \
	"$(ev "(() => ({ popups: document.querySelectorAll('.fse-popup').length }))()")"

echo
echo "5. slash stays literal outside a block position"
SECTION=5
setup_note 'see https://example.com and or/other\n' 1 4
dom_key / Slash 191
S="$(state)"
check "no menu mid-word" '"menu":false' "$S"
check "the URL line is untouched" 'example.com' \
	"$(printf '%s' "$S" | grep -o '"lineText":"[^"]*"')"

echo
echo "6. selection toolbar"
SECTION=6
setup_note 'hello world\n' 1 0
ev "(() => {
	const l = app.workspace.getLeavesOfType('markdown').find(x => x.view.file && x.view.file.path === '$NOTE');
	l.view.editor.cm.dispatch({ selection: { anchor: 0, head: 5 } });
	return 'ok';
})()" >/dev/null
sleep 0.7
S="$(state)"
check "toolbar appears for a selection" '"scope":"toolbar"' "$S"
check "toolbar offers bold" '"Bold"' "$S"

echo
echo "7. block handle"
SECTION=7
setup_note 'make me a heading\n' 1 0
check "handle is rendered" '"handle":true' \
	"$(ev "(() => ({ handle: !!document.querySelector('.fse-block-handle') }))()")"
ev "(() => {
	const h = document.querySelector('.fse-block-handle');
	h.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
	h.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
	return 'ok';
})()" >/dev/null
sleep 0.7
check "the handle opens the block menu" '"Table"' "$(state)"

echo
echo "8. the palette is organised into sections"
SECTION=8
setup_note 'plain text line\n' 1 0
ev "(() => {
	const h = document.querySelector('.fse-block-handle');
	if (!h) return 'nohandle';
	h.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
	h.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
	return 'ok';
})()" >/dev/null
sleep 0.8
PALETTE="$(state)"
check "basic blocks are listed" '"Heading 1"' "$PALETTE"
check "common blocks are listed" '"Table"' "$PALETTE"
check "advanced blocks are listed" '"Code block"' "$PALETTE"
check "the submenu entry is present" '"Callout"' "$PALETTE"
LAYOUT="$(ev "(() => {
	const p = [...document.querySelectorAll('.fse-popup')].find(x => getComputedStyle(x).display !== 'none');
	if (!p) return JSON.stringify({ error: 'no palette' });
	return JSON.stringify({
		titles: [...p.querySelectorAll('.fse-popup-section-title')].map(e => e.textContent),
		grids: [...p.querySelectorAll('.fse-popup-group-grid')].length,
		lists: [...p.querySelectorAll('.fse-popup-group-list')].length,
		accented: [...p.querySelectorAll('.fse-popup-item-tile')].filter(t => t.getAttribute('data-accent') !== 'plain').length,
		chevrons: p.querySelectorAll('.fse-popup-item-chevron').length,
	});
})()")"
check "sections carry Feishu-style headings" '"titles":["Basic","Common","Advanced"]' "$LAYOUT"
check "the basic section renders as an icon grid" '"grids":1' "$LAYOUT"
check "the other sections render as lists" '"lists":2' "$LAYOUT"
check "icons are colour-coded" '"accented":' "$LAYOUT"
check "the submenu entry shows a chevron" '"chevrons":1' "$LAYOUT"
close_section

echo
echo "9. settings persist"
ev "app.plugins.plugins['feishu-style-editor'].updateSettings({ slashCommands: false })" >/dev/null
check "a changed toggle is saved" '"slashCommands":false' \
	"$(ev "app.plugins.plugins['feishu-style-editor'].settings")"
check "the value reached disk" '"slashCommands":false' \
	"$(ev "(async () => JSON.stringify(await app.plugins.plugins['feishu-style-editor'].loadData()))()")"
ev "app.plugins.plugins['feishu-style-editor'].updateSettings({ slashCommands: true })" >/dev/null

echo
echo "10. no runtime errors"
check "no plugin errors in the console" '0' \
	"$(oc dev:console level=error limit=30 | grep -ci 'feishu-style-editor')"

echo
if [ "$SKIP" -gt 0 ]; then
	printf 'result: %d passed, %d failed, %d skipped\n' "$PASS" "$FAIL" "$SKIP"
else
	printf 'result: %d passed, %d failed\n' "$PASS" "$FAIL"
fi
[ "$FAIL" -eq 0 ] || exit 1
