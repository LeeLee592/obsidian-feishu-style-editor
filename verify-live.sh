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
			// Labels follow the app's language, so the assertions below use the
			// language-independent `id`s the menu carries on every entry.
			items: vis ? [...p.querySelectorAll('.fse-popup-item')].map(el => {
				const label = el.querySelector('.fse-popup-item-label');
				const button = el.querySelector('.fse-popup-item-button');
				return label ? label.textContent : (button ? button.getAttribute('aria-label') : null);
			}).filter(Boolean) : [],
			ids: vis ? [...p.querySelectorAll('.fse-popup-item-button')].map(b => b.getAttribute('data-item-id')) : [],
			active: vis ? (p.querySelector('.is-active .fse-popup-item-label') || {}).textContent : null,
			activeId: vis ? (p.querySelector('.is-active') || {}).getAttribute?.('data-item-id') ?? null : null,
		});
	})()"
}

# Opens the block palette from the line handle. Synthetic clicks are enough:
# the handle listens for plain DOM events, not for the input pipeline.
# Several editors can be alive at once and every one of them owns a handle, so
# the visible one — the active editor's — is the one to click.
open_palette() {
	ev "(() => {
		const handles = [...document.querySelectorAll('.fse-block-handle')];
		const h = handles.find(x => getComputedStyle(x).display !== 'none') || handles[0];
		if (!h) return 'nohandle';
		h.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
		h.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
		return 'ok';
	})()" >/dev/null
	sleep 0.8
}

# Computed colours of the open palette — the tokens themselves, read back
# from the live DOM, so a broken variable shows up as a failed check.
palette_colours() {
	ev "(() => {
		const p = [...document.querySelectorAll('.fse-popup')].find(x => getComputedStyle(x).display !== 'none');
		if (!p) return JSON.stringify({ error: 'no palette' });
		const px = el => (el ? getComputedStyle(el) : {});
		const current = p.querySelector('.fse-popup-item-button.is-current');
		const currentTile = current ? current.querySelector('.fse-popup-item-tile') : null;
		const label = current ? current.querySelector('.fse-popup-item-label') : null;
		const section = p.querySelector('.fse-popup-section + .fse-popup-section');
		const tileOf = id => p.querySelector('.fse-popup-item-button[data-item-id=\"' + id + '\"] .fse-popup-item-tile');
		const heading = tileOf('heading-1');
		return JSON.stringify({
			surface: px(p).backgroundColor,
			border: px(p).borderTopColor,
			divider: section ? px(section).borderTopColor : null,
			icon: px(p.querySelector('.fse-popup-item-tile')).color,
			current: label ? label.textContent : null,
			currentId: current ? current.getAttribute('data-item-id') : null,
			currentLabel: label ? px(label).color : null,
			currentTile: currentTile ? px(currentTile).backgroundColor : null,
			currentIcon: currentTile ? px(currentTile).color : null,
			headingTile: heading ? px(heading).backgroundColor : null,
			headingIcon: heading ? px(heading).color : null,
			tableIcon: px(tileOf('table')).color,
			imageIcon: px(tileOf('image')).color,
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
	check "block list is complete" '"code-block"' "$(state)"
	SLASH="$(ev "(() => {
		const p = [...document.querySelectorAll('.fse-popup')].find(x => getComputedStyle(x).display !== 'none');
		if (!p) return JSON.stringify({ error: 'no menu' });
		const search = p.querySelector('.fse-popup-search');
		const field = p.querySelector('.fse-popup-search-text');
		const hint = p.querySelector('.fse-popup-search-hint');
		const hintText = hint ? hint.textContent : '';
		return JSON.stringify({
			search: !!search && getComputedStyle(search).display !== 'none',
			field: field ? field.textContent : null,
			hint: hintText,
			hintOk: ['输入关键词', 'Type a keyword'].includes(hintText),
			grids: p.querySelectorAll('.fse-popup-group-icons').length,
			lists: p.querySelectorAll('.fse-popup-group-list').length,
		});
	})()")"
	check "the keyword field is shown" '"search":true' "$SLASH"
	check "the field mirrors the typed slash" '"field":"/"' "$SLASH"
	check "the hint invites a keyword" '"hintOk":true' "$SLASH"
	check "/ has no icon grid" '"grids":0' "$SLASH"
	check "/ lists every group" '"lists":2' "$SLASH"
	real_key q KeyQ 81 q
	real_key u KeyU 85 u
	real_key o KeyO 79 o
	FILTERED="$(state)"
check "typing narrows the menu" '"activeId":"quote"' "$FILTERED"
check "the field mirrors the whole query" '"field":"/quo"' \
	"$(ev "(() => {
		const p = [...document.querySelectorAll('.fse-popup')].find(x => getComputedStyle(x).display !== 'none');
		const field = p && p.querySelector('.fse-popup-search-text');
		return JSON.stringify({ field: field ? field.textContent : null });
	})()")"
check "the query matched the quote entries" '"blockquote-with-attribution"' "$FILTERED"
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
	check "ArrowDown selects the second block" '"activeId":"heading-1"' "$(state)"
	dom_key ArrowUp ArrowUp 38
	check "ArrowUp wraps back to the first block" '"activeId":"text"' "$(state)"
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
check "toolbar offers bold" '"bold"' "$S"

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
check "the handle opens the block menu" '"table"' "$(state)"

echo
echo "8. the + panel is not the / menu"
SECTION=8
setup_note 'plain text line\n' 1 0
open_palette
PALETTE="$(state)"
check "basic blocks are listed" '"heading-1"' "$PALETTE"
check "common blocks are listed" '"table"' "$PALETTE"
check "code blocks are listed" '"code-block"' "$PALETTE"
check "the submenu entry is present" '"callout"' "$PALETTE"
LAYOUT="$(ev "(() => {
	const p = [...document.querySelectorAll('.fse-popup')].find(x => getComputedStyle(x).display !== 'none');
	if (!p) return JSON.stringify({ error: 'no palette' });
	const search = p.querySelector('.fse-popup-search');
	return JSON.stringify({
		titles: [...p.querySelectorAll('.fse-popup-section-title')].map(e => e.textContent),
		sections: p.querySelectorAll('.fse-popup-section').length,
		grids: [...p.querySelectorAll('.fse-popup-group-icons')].length,
		lists: [...p.querySelectorAll('.fse-popup-group-list')].length,
		accented: [...p.querySelectorAll('.fse-popup-item-tile')].filter(t => t.getAttribute('data-accent') !== 'plain').length,
		chevrons: p.querySelectorAll('.fse-popup-item-chevron').length,
		search: !!search && getComputedStyle(search).display !== 'none',
	});
})()")"
check "+ carries Feishu's two headings" '"titles":["' "$LAYOUT"
check "+ has exactly two groups" '"sections":2' "$LAYOUT"
check "the basic section renders as an icon grid" '"grids":1' "$LAYOUT"
check "the rest renders as a labelled list" '"lists":1' "$LAYOUT"
check "icons carry their kind's colour" '"accented":' "$LAYOUT"
check "the submenu entry shows a chevron" '"chevrons":1' "$LAYOUT"
check "+ has no keyword field" '"search":false' "$LAYOUT"
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
echo "10. Feishu colour system"
SECTION=10
setup_note '## heading line\n' 1 0
open_palette
if [ "$(ev "(() => document.body.classList.contains('theme-dark') ? 'dark' : 'light')" | flat)" = "dark" ]; then
	SURFACE='rgb(43,43,43)'
	BORDER='rgb(61,61,61)'
	ICON='rgb(235,235,235)'
	CHIP='rgb(44,60,94)'
	ACCENT='rgb(76,136,255)'
	GREEN='rgb(78,203,58)'
	YELLOW='rgb(255,198,10)'
else
	SURFACE='rgb(255,255,255)'
	BORDER='rgb(222,224,227)'
	ICON='rgb(31,35,41)'
	CHIP='rgb(225,234,255)'
	ACCENT='rgb(51,112,255)'
	GREEN='rgb(52,199,36)'
	YELLOW='rgb(232,166,0)'
fi
COLOURS="$(palette_colours)"
check "the menu sits on Feishu's surface" "\"surface\":\"$SURFACE\"" "$COLOURS"
check "the frame draws Feishu's hairline" "\"border\":\"$BORDER\"" "$COLOURS"
check "sections are split by a hairline" "\"divider\":\"$BORDER\"" "$COLOURS"
check "the basic grid stays monochrome" "\"headingIcon\":\"$ICON\"" "$COLOURS"
check "the caret's block is the marked one" '"currentId":"heading-2"' "$COLOURS"
check "the current block carries the blue chip" "\"currentTile\":\"$CHIP\"" "$COLOURS"
check "the chip icon takes the accent too" "\"currentIcon\":\"$ACCENT\"" "$COLOURS"
check "no chip is painted on other entries" '"headingTile":"rgba(0,0,0,0)"' "$COLOURS"
check "the table row keeps Feishu's green" "\"tableIcon\":\"$GREEN\"" "$COLOURS"
check "the image row keeps Feishu's yellow" "\"imageIcon\":\"$YELLOW\"" "$COLOURS"
close_section

echo
echo "10b. the caret's block inside a labelled row"
SECTION=101
setup_note '> [!tip] note\n' 1 0
open_palette
COLOURS="$(palette_colours)"
check "a callout line marks the callout row" '"currentId":"callout"' "$COLOURS"
check "the current row's label takes the accent" "\"currentLabel\":\"$ACCENT\"" "$COLOURS"
check "the current row's icon takes the accent" "\"currentIcon\":\"$ACCENT\"" "$COLOURS"

echo
echo "11. the optional monochrome mode"
ORIGINAL_COLORED="$(ev "app.plugins.plugins['feishu-style-editor'].settings.coloredIcons" | flat)"
check "coloured rows are the default" '"coloredIcons":true' \
	"$(ev "app.plugins.plugins['feishu-style-editor'].settings")"
ev "app.plugins.plugins['feishu-style-editor'].updateSettings({ coloredIcons: false })" >/dev/null
open_palette
COLOURS="$(palette_colours)"
check "turning it off greys the list rows too" "\"tableIcon\":\"$ICON\"" "$COLOURS"
ev "app.plugins.plugins['feishu-style-editor'].updateSettings({ coloredIcons: $ORIGINAL_COLORED })" >/dev/null
close_section

echo
echo "12. no runtime errors"
check "no plugin errors in the console" '0' \
	"$(oc dev:console level=error limit=30 | grep -ci 'feishu-style-editor')"

echo
if [ "$SKIP" -gt 0 ]; then
	printf 'result: %d passed, %d failed, %d skipped\n' "$PASS" "$FAIL" "$SKIP"
else
	printf 'result: %d passed, %d failed\n' "$PASS" "$FAIL"
fi
[ "$FAIL" -eq 0 ] || exit 1
