"use strict";
// parse-utils.lib.test.civet

import {CParseMatches} from 'parse-utils'
import {equal} from 'unit-test'

// ---------------------------------------------------------------------------

const str = `./x
test
	im
	ex
		ret`

const pm = new CParseMatches()
pm.match('EOL',      [ 3, 1])
pm.match('Root',     [ 0, 4])
pm.match('Name',     [ 4, 4])
pm.match('EOL',      [ 8, 1])
pm.match('FileName', [ 4, 5])
pm.match('INDENT',   [ 9, 1])
pm.match('EOL',      [12, 1])
pm.match('Line',     [10, 3])
pm.match('EOL',      [15, 1])
pm.match('Line',     [13, 3])
pm.match('INDENT',   [16, 1])
pm.match('EOL',      [20, 1])
pm.match('Line',     [17, 4])
pm.match('Block',    [17, 4])
pm.match('UNDENT',   [21, 1])
pm.match('Block',    [10, 6])

equal(pm.matchesTable(), `   Op    Pos Len Data
EOL        3   1
Root       0   4
Name       4   4
EOL        8   1
FileName   4   5
INDENT     9   1
EOL       12   1
Line      10   3
EOL       15   1
Line      13   3
INDENT    16   1
EOL       20   1
Line      17   4
Block     17   4
UNDENT    21   1
Block     10   6`)