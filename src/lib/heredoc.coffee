# heredoc.coffee

import {
	undef, defined, notdefined, OL, CWS, arrayToBlock,
	assert, croak, behead, fromTAML,
	isString, isClassInstance,
	} from '@jdeighan/llutils'
import {
	indented, undented, splitLine,
	} from '@jdeighan/llutils/indent'
import {LineFetcher} from '@jdeighan/llutils/fetcher'

lHereDocs = []   # checked in this order - list of type names
hHereDocs = {}   # {type: obj}

# ---------------------------------------------------------------------------
# Returns a string or undef

export mapHereDoc = (block) ->

	assert isString(block), "not a string: #{OL(block)}"
	for type in lHereDocs
		heredocObj = hHereDocs[type]
		result = heredocObj.map(block)
		if defined(result)
			assert isString(result), "result not a string"
			return result

	result = JSON.stringify(block)    # can directly replace <<<
	return result

# ---------------------------------------------------------------------------
# --- fetcher is a PLLFetcher, i.e. it has methods
#        moreLines()
#        peek()
#        peekLevel()
#        fetch()
#        skip()
#        getBlock(level)

export replaceHereDocs = (level, line, src) =>

	assert isString(line), "not a string"
	assert (src instanceof LineFetcher), "not a LineFetcher"

	lParts = lineToParts(line)
	lNewParts = for part in lParts
		if part == '<<<'

			lLines = while src.moreLines()
				[level, str] = splitLine(src.fetch())
				if (level == 0) && (str == '')
					break
				indented(str, level)

			block = undented(arrayToBlock(lLines))

			str = mapHereDoc(block)
			assert isString(str), "Not a string: #{OL(str)}"
			str
		else
			part    # keep as is

	result = lNewParts.join('')
	return result

# ---------------------------------------------------------------------------

export lineToParts = (line) ->
	# --- Always returns an odd number of parts
	#     Odd numbered parts are '<<<', Even numbered parts are not '<<<'

	lParts = []
	pos = 0
	while ((start = line.indexOf('<<<', pos)) != -1)
		lParts.push line.substring(pos, start)
		lParts.push '<<<'
		pos = start + 3
	lParts.push line.substring(pos)
	return lParts

# ---------------------------------------------------------------------------

export addHereDocType = (type, obj) ->

	assert isString(type, {nonempty: true}), "type is #{OL(type)}"
	assert isClassInstance(obj, 'map'), "Bad input object: #{OL(obj)}"
	assert (obj instanceof BaseHereDoc), "not a BaseHereDoc"
	assert notdefined(hHereDocs[type]), "Heredoc type #{type} already installed"
	lHereDocs.push type
	hHereDocs[type] = obj
	return

# ---------------------------------------------------------------------------
# ---------------------------------------------------------------------------
# --- To extend,
#        define map(block) that:
#           returns undef if it's not your HEREDOC type
#           else returns a CieloScript expression

export class BaseHereDoc

	map: (block) ->

		return undef

# ---------------------------------------------------------------------------

export class ExplicitBlockHereDoc extends BaseHereDoc
	# --- First line must be '==='
	#     Return value is quoted string of remaining lines

	map: (block) ->

		[head, rest] = behead(block)
		if (head != '===')
			return undef
		return JSON.stringify(rest)

# ---------------------------------------------------------------------------

export class OneLineHereDoc extends BaseHereDoc
	# --- First line must begin with '...'
	#     Return value is single line string after '...' with
	#        runs of whitespace replaced with a single space char

	map: (block) ->

		[head, rest] = behead(block)
		if (head.indexOf('...') != 0)
			return undef
		return JSON.stringify(CWS(block.substring(3)))

# ---------------------------------------------------------------------------

export class TAMLHereDoc extends BaseHereDoc
	# --- First line must be '---'

	map: (block) ->

		[head, rest] = behead(block)
		if (head != '---')
			return undef
		obj = fromTAML(block)
		result = JSON.stringify(obj)
		return result

# ---------------------------------------------------------------------------

# --- Add the standard HEREDOC types
addHereDocType 'one line', new OneLineHereDoc()
addHereDocType 'block', new ExplicitBlockHereDoc()
addHereDocType 'taml', new TAMLHereDoc()
