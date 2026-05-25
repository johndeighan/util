vi editor
---------

i = enter insert mode at current location
a = enter insert node at next location
<esc> = enter command mode
:q = quit if not changes
:q! = quit even if unsaved changes
:w - write existing file
:w <filename> - save file
:wq - save file, then quit
h - move left
j = move down
k = move up
l = move right
o = add new line after current line and enter insert mode
O = add new line below current line and enter insert mode
<n>dd - cut current line + n-1 more lines into buffer
p - paste line from buffer after current line
P = past line from buffer before current line
$ = move cursor to end of current line
0 = move cursor to start of current line
A = append at end of current line
u = undo (multi level)
Ctrl-r - redo
<n>yy - copy current line + n-1 more lines into buffer
w = move forward one word
G = move cursor to end of file
<n>G = move to line <n>
/<text>\n = search for text downward
?<text>\n = search for text upward
n = repeat last command
:1,$s/word/newword/g - replace all occurrances of word with newword
D = delete from cursor to end of line
"a or "2   - specify named buffer for yank/delete/paste
x = delete character at cursor
X = delete character before cursor
Y = copy current line into buffer
I = insert at beginning of line

Ctrl-f = scroll down one window
Ctrl-b = scroll up one window
Ctrl-d = scroll down 1/2 window
Ctrl-u = scroll up 1/2 window
Ctrl-m = move cursor to beginning of next line
% - move to matching ( { or [
^ = move to first non-whitespace char on line
_ = move to first non-whitespace char on line
<n>| = move to column <n>
+ = move to first non-whitespace char in next line
- = move to first non-whitespace char in prev line
B = move to previous word, skipping punctuation
E = move to next word, skipping punctuation
H = move to first non-whitespace char on top of screen
L = move to first non-whitespace char on bottom of screen
M = move to first non-whitespace char in middle of screen
W = move to next word, skipping punctuation
Ctrl-E - scroll down one line
Ctrl-Y - scroll up one line
z<return> = scroll current line to top of screen
z. = scroll current line to middle of screen
z- = scroll current line to bottom of screen
C - delete to end of line and enter insert mode
R - enter insert mode in replace mode (chars are overwritten)
cc - delete line and enter insert mode
S - delete line and enter insert mode
r<char> - replace char under cursor with <char>
s<char> - replace char under cursor with <char> and enter insert mode

f<char> search forward in current line for <char>
t<char> search forward in current line for <char>, position cursor on previous letter
F<char> search backward in current line for <char>
T<char> search backward in current line for <char>, position cursor on following letter
; - repeat last f, t, F or T command
, - repeat last f, t, F or T command, in reverse direction
n - repeat last / or ? command
N - repeat last / or ? command in reverse direction
~ - switch case of char under the cursor
J - join line with next line
<n>J - join n lines
Ctrl-G - display file name and status
Ctrl-L, Ctrl-R - refresh screen
. = repeat last command that modified the file
@ = execute command found in specified buffer


Can't get these to work:
! - execute a shell command
!! - execute a shell command using current line as input
e.g.
	!4jsort    - will sort 5 lines

