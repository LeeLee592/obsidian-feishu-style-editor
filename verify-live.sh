#!/bin/bash
# Live end-to-end verification for the Feishu Style Editor plugin.
#
# Drives the running Obsidian app through its CLI + Chrome DevTools Protocol:
# real key events are dispatched, so the plugin's input handler and keymap are
# exercised exactly as they are by a user's keystrokes.
#
# Two environment facts this script has to respect (learned the hard way):
#   * the CLI can hang and produces no output when it does -> every call is
#     wrapped in an alarm;
#   * focus moves away from the editor (plugin reloads, other windows), and a
#     view whose leaf is not active silently swallows dispatched keys -> focus
#     is re-established, and asserted, before every keystroke.
#
# Requirements: Obsidian running with the target vault in front and the plugin
# deployed and enabled. Run `node deploy-test.mjs` first.
#
# Usage:  ./verify-live.sh [vault-name]
set -u

VAULT="${1:-Test}"
NOTE="feishu-live-check.md"
PASS=0
FAIL=0

oc() {
	perl -e 'alarm 25; exec @ARGV' obsidian "$@" 2>&1
}

ev() {
	oc eval code="$1"
}

# Flattens pretty-printed CLI JSON: the CLI prints "=> {\"a\": 1}", so the
# report is normalised to a compact form before it is matched.
flat() {
	tr -d '\n\t' | sed 's/^ *=> *//; s/  */ /g; s/: /:/g; s/, /,/g'
}

# focus_editor [path] — makes the note's editor the focused editor and waits
# until CodeMirror agrees, so a dispatched key actually reaches it.
focus_editor() {
	local path="${1:-$NOTE}"
	local out
	for _ in 1 2 3; do
		out="$(ev "(async () => {
			const sleep = ms => new Promise(r => setTimeout(r, ms));
			const l = app.workspace.getLeavesOfType('markdown').find(x => x.view.file && x.view.file.path === '$path');
			if (!l) return 'no leaf';
			app.workspace.setActiveLeaf(l, { focus: true });
			const w = require('electron').remote.getCurrentWindow(); w.show(); w.focus();
			for (let i = 0; i < 20; i++) {
				await sleep(100);
				const cm = l.view.editor.cm;
				cm.focus();
				if (cm.hasFocus) return 'focused';
			}
			return 'unfocused';
		})()")"
		if printf '%s' "$out" | grep -q focused && ! printf '%s' "$out" | grep -q unfocused; then
			return 0
		fi
	done
	printf '  WARN  could not focus the editor for %s\n' "$path" >&2
	return 1
}

key() {
	# key <key> <code> <keyCode> [text]
	#
	# The event is dispatched into the target editor's own content DOM rather
	# than through the OS keyboard queue. A real key event goes to whatever
	# window the user has focused, which makes a test fight the user for the
	# window; a bubbling DOM event still travels the plugin's real handlers
	# (input handler, view plugin key handler, keymap) and nothing else.
	local k="$1" c="$2" kc="$3" t="${4:-}"
	ev "(async () => {
		const sleep = ms => new Promise(r => setTimeout(r, ms));
		const l = app.workspace.getLeavesOfType('markdown').find(x => x.view.file && x.view.file.path === '$NOTE');
		if (!l) return 'no leaf';
		const cm = l.view.editor.cm;
		cm.focus();
		const init = { key: '$k', code: '$c', keyCode: $kc, which: $kc, bubbles: true, cancelable: true }
		if ('$t') { init.text = '$t'; }
		const down = new KeyboardEvent('keydown', init);
		cm.contentDOM.dispatchEvent(down);
		if ('$t' && !down.defaultPrevented) {
			try {
				document.execCommand('insertText', false, '$t');
			} catch (e) { /* the editor may refuse; the slash handler is what matters */ }
		}
		await sleep(120);
		return 'ok';
	})()" >/dev/null
	sleep 0.35
}

check() {
	# check <label> <expected-substring> <actual>
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

# Opens the note with fresh content and puts the caret on <line>:<col>.
reset_editor() {
	ev "(async () => {
		const sleep = ms => new Promise(r => setTimeout(r, ms));
		const f = app.vault.getAbstractFileByPath('$NOTE') || await app.vault.create('$NOTE', '');
		await app.vault.modify(f, '$1');
		let leaf = app.workspace.getLeavesOfType('markdown').find(l => l.view.file && l.view.file.path === '$NOTE');
		if (!leaf) leaf = app.workspace.getLeaf(true);
		await leaf.openFile(f, { state: { mode: 'source' } });
		app.workspace.setActiveLeaf(leaf, { focus: true });
		const w = require('electron').remote.getCurrentWindow(); w.show(); w.focus();
		const cm = leaf.view.editor.cm;
		cm.focus();
		const line = cm.state.doc.line(Math.min(Math.max($2, 1), cm.state.doc.lines));
		cm.dispatch({ selection: { anchor: line.from + $3 } });
		await sleep(250);
		return 'ok';
	})()" >/dev/null
	focus_editor "$NOTE" || true
}

# Reads the plugin's observable state for the note under test.
# Content, caret and the first keystroke are set in one call: a live user can
# edit the same note between two CLI calls, which would otherwise invalidate
# the precondition (e.g. a slash typed mid-word opens no menu by design).
reset_and_slash() {
	# reset_and_slash <content-with-\n-escapes> <line> <col>
	# This environment is shared with a live user, so a busy precondition is
	# retried rather than silently producing a meaningless measurement.
	local out
	for _ in 1 2 3 4; do
		out="$(reset_and_slash_once "$@")"
		if printf '%s' "$out" | flat | grep -qx 'ok'; then
			sleep 0.3
			return 0
		fi
		sleep 0.4
	done
	printf '  WARN  could not establish a quiet editor state\n' >&2
}

reset_and_slash_once() {
	ev "(async () => {
		const sleep = ms => new Promise(r => setTimeout(r, ms));
		const f = app.vault.getAbstractFileByPath('$NOTE') || await app.vault.create('$NOTE', '');
		await app.vault.modify(f, '$1');
		let leaf = app.workspace.getLeavesOfType('markdown').find(l => l.view.file && l.view.file.path === '$NOTE');
		if (!leaf) leaf = app.workspace.getLeaf(true);
		await leaf.openFile(f, { state: { mode: 'source' } });
		app.workspace.setActiveLeaf(leaf, { focus: true });
		const w = require('electron').remote.getCurrentWindow(); w.show(); w.focus();
		const cm = leaf.view.editor.cm;
		cm.focus();
		const line = cm.state.doc.line(Math.min(Math.max($2, 1), cm.state.doc.lines));
		const anchor = line.from + $3;
		cm.dispatch({ selection: { anchor } });
		await sleep(200);
		cm.focus();
		// Only fire while the precondition holds. The content was just
		// rewritten, so also require the caret's line to be exactly the one
		// asked for: a live user typing in the same note would otherwise
		// silently change what this test measures.
		if (cm.state.selection.main.head !== anchor) return 'busy';
		if (cm.state.doc.toString() !== ('$1').replace(/\\n/g, '\n')) return 'busy';
		const down = new KeyboardEvent('keydown', { key: '/', code: 'Slash', keyCode: 191, which: 191, bubbles: true, cancelable: true, text: '/' });
		cm.contentDOM.dispatchEvent(down);
		if (!down.defaultPrevented) {
			try { document.execCommand('insertText', false, '/'); } catch (e) { /* see key() */ }
		}
		await sleep(150);
		return 'ok';
	})()" >/dev/null
	sleep 0.4
}

state() {
	ev "(() => {
		const leaf = app.workspace.getLeavesOfType('markdown').find(l => l.view.file && l.view.file.path === '$NOTE');
		if (!leaf) return JSON.stringify({ error: 'note not open' });
		const cm = leaf.view.editor.cm;
		const p = [...document.querySelectorAll('.fse-popup')].find(x => x.querySelectorAll('.fse-popup-item').length);
		const vis = p ? getComputedStyle(p).display !== 'none' : false;
		const line = cm.state.doc.lineAt(cm.state.selection.main.head);
		return JSON.stringify({
			vault: app.vault.getName(),
			focused: cm.hasFocus,
			doc: cm.state.doc.toString(),
			caretCol: cm.state.selection.main.head - line.from,
			line: line.number,
			lineCount: cm.state.doc.lines,
			lineText: line.text,
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

echo "Feishu Style Editor — live verification (vault: $VAULT)"
echo

echo "1. the running app has the plugin loaded"
check "plugin registered" '"ready":true' \
	"$(ev "(() => ({ ready: !!app.plugins.plugins['feishu-style-editor'], vault: app.vault.getName() }))()")"
check "one shared popup, no leak" '"popups":1' \
	"$(ev "(() => ({ popups: document.querySelectorAll('.fse-popup').length }))()")"

echo
echo "2. slash menu opens, filters and applies"
reset_and_slash 'alpha\nbeta\n' 3 0
S="$(state)"
check "menu opens with every block" '"menu":true' "$S"
check "block list is complete" '"Table"' "$S"
key q KeyQ 81 q
key u KeyU 85 u
key o KeyO 79 o
check "query narrows to Quote" '"items":["Quote"]' "$(state)"
key Enter Enter 13
S="$(state)"
# Assertions are relative: a live user can type in the same note while this
# runs, so only the caret's own line is compared.
check "the line became a quote" '"lineText":"> "' "$S"
check "caret sits inside the block" '"caretCol":2' "$S"

echo
echo "3. slash stays literal outside a block position"
reset_editor 'see https://example.com and or/other\n' 1 4
key / Slash 191 /
S="$(state)"
check "no menu mid-word" '"menu":false' "$S"
BEFORE="$(printf '%s' "$S" | grep -o '"lineText":"[^"]*"' || true)"
check "URL line unchanged" 'example.com' "$BEFORE"

echo
echo "4. escape retracts the slash"
reset_and_slash 'alpha\n' 2 0
key Escape Escape 27
S="$(state)"
check "slash removed on escape" '"lineText":""' "$S"
check "menu closed" '"menu":false' "$S"

echo
echo "5. arrow keys move the selection"
reset_and_slash 'alpha\n' 2 0
key ArrowDown ArrowDown 40
check "second item is active" '"active":"Heading 1"' "$(state)"
key ArrowUp ArrowUp 38
check "arrow up wraps back" '"active":"Text"' "$(state)"

echo
echo "6. selection toolbar"
reset_editor 'hello world\n' 1 0
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
echo "7. block handle opens the block menu"
reset_editor 'make me a heading\n' 1 0
check "handle is rendered" '"handle":true' \
	"$(ev "(() => ({ handle: !!document.querySelector('.fse-block-handle') }))()")"
ev "(() => {
	const h = document.querySelector('.fse-block-handle');
	h.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
	h.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
	return 'ok';
})()" >/dev/null
sleep 0.6
check "block menu opens from the handle" '"Table"' "$(state)"

echo
echo "8. settings persist"
ev "app.plugins.plugins['feishu-style-editor'].updateSettings({ slashCommands: false })" >/dev/null
check "a changed toggle is saved" '"slashCommands":false' \
	"$(ev "app.plugins.plugins['feishu-style-editor'].settings")"
check "value reached disk" '"slashCommands":false' \
	"$(ev "(async () => JSON.stringify(await app.plugins.plugins['feishu-style-editor'].loadData()))()")"
ev "app.plugins.plugins['feishu-style-editor'].updateSettings({ slashCommands: true })" >/dev/null


echo "9. no runtime errors"
check "no plugin errors in the console" '0' \
	"$(oc dev:console level=error limit=30 | grep -c 'feishu-style-editor')"

echo
printf 'result: %d passed, %d failed\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ] || exit 1
