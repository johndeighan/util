//@ts-nocheck
import {
  $C,
  $E,
  $EVENT,
  $EVENT_C,
  $EXPECT,
  $L,
  $N,
  $P,
  $Q,
  $R,
  $R$0,
  $S,
  $T,
  $TEXT,
  $TR,
  $TS,
  $TV,
  $Y,
  ParseError,
  Validator,
} from "npm:@danielx/hera/lib"


const grammar = {
    FullDesc: FullDesc,
Root: Root,
FileDesc: FileDesc,
FileName: FileName,
DirDesc: DirDesc,
DirName: DirName,
Part: Part,
Block: Block,
Line: Line,
IndentedBlock: IndentedBlock,
Name: Name,
INDENT: INDENT,
UNDENT: UNDENT,
NL: NL,
_: _
  };


const grammarDefaultRule = "FullDesc";

const $L0 = $L("clear");
const $L1 = $L("compile");
const $L2 = $L("/");
const $L3 = $L(" ");


const $R0 = $R(new RegExp("\\.\\.?\\/[A-Za-z_$\\/-]+", 'suy'));
const $R1 = $R(new RegExp("[^\\x0F\\x0E\\n]*", 'suy'));
const $R2 = $R(new RegExp("[A-Za-z_.-][A-Za-z0-9_.-]*", 'suy'));
const $R3 = $R(new RegExp("\\x0F", 'suy'));
const $R4 = $R(new RegExp("\\x0E", 'suy'));
const $R5 = $R(new RegExp("\\r?\\n", 'suy'));


//@ts-ignore
const FullDesc$0 = $TS($S(Root, $P($C(FileDesc, DirDesc))), function($skip, $loc, $0, $1, $2) {

ruleMatch('FullDesc', $loc, lOps);
return lOps;
});
//@ts-ignore
function FullDesc(ctx, state) { return $EVENT(ctx, state, "FullDesc", FullDesc$0) }

//@ts-ignore
const Root$0 = $TS($S($EXPECT($R0, "Root /\\.\\.?\\/[A-Za-z_$\\/-]+/"), _, $E($EXPECT($L0, "Root \"clear\"")), NL), function($skip, $loc, $0, $1, $2, $3, $4) {

const lOps = [];
pm = new CParseMatches();
if (defined(3)) {
  lOps.push({
    op: 'clearDir',
    path: $1
    });
  }
lPathParts = [$1];
ruleMatch('Root', $loc);
});
//@ts-ignore
function Root(ctx, state) { return $EVENT(ctx, state, "Root", Root$0) }

//@ts-ignore
const FileDesc$0 = $TS($S(FileName, INDENT, Block, UNDENT), function($skip, $loc, $0, $1, $2, $3, $4) {

let [name, compile] = $1;
lOps.push({
  op: 'barf',
  path: getPath(name),
  contents: $3
  });
if (compile) {
  lOps.push({
    op: 'compile',
    path: getPath(name)
    });
  }
ruleMatch('FileDesc', $loc);
});
//@ts-ignore
function FileDesc(ctx, state) { return $EVENT(ctx, state, "FileDesc", FileDesc$0) }

//@ts-ignore
const FileName$0 = $TS($S(Name, _, $E($EXPECT($L1, "FileName \"compile\"")), NL), function($skip, $loc, $0, $1, $2, $3, $4) {

let result = [$1, defined($3)]
ruleMatch('FileName', $loc, result);
return result
});
//@ts-ignore
function FileName(ctx, state) { return $EVENT(ctx, state, "FileName", FileName$0) }

//@ts-ignore
const DirDesc$0 = $TS($S(DirName, INDENT, $P($C(DirDesc, FileDesc)), UNDENT), function($skip, $loc, $0, $1, $2, $3, $4) {

lPathParts.pop()
ruleMatch('DirDesc', $loc);
});
//@ts-ignore
function DirDesc(ctx, state) { return $EVENT(ctx, state, "DirDesc", DirDesc$0) }

//@ts-ignore
const DirName$0 = $TS($S($EXPECT($L2, "DirName \"/\""), Name, _, $E($EXPECT($L0, "DirName \"clear\"")), NL), function($skip, $loc, $0, $1, $2, $3, $4, $5) {

lPathParts.push($2);
if (defined($4)) {
  lOps.push({
    op: 'clearDir',
    path: getPath($2)
    });
  }
ruleMatch('DirName', $loc);
});
//@ts-ignore
function DirName(ctx, state) { return $EVENT(ctx, state, "DirName", DirName$0) }

//@ts-ignore
const Part$0 = $TV($C(IndentedBlock, Line), function($skip, $loc, $0, $1) {

ruleMatch('Part', $loc, $1)
return $1
});
//@ts-ignore
function Part(ctx, state) { return $EVENT(ctx, state, "Part", Part$0) }

//@ts-ignore
const Block$0 = $TS($S(Part, $Q($S(NL, Part))), function($skip, $loc, $0, $1, $2) {

const lParts: string[] = [$1]
for (const [_, text] of $2) {
  lParts.push(text);
  }
let result = lParts.join('\n');
ruleMatch('Block', $loc, result);
return result;
});
//@ts-ignore
function Block(ctx, state) { return $EVENT(ctx, state, "Block", Block$0) }

//@ts-ignore
const Line$0 = $TR($EXPECT($R1, "Line /[^\\x0F\\x0E\\n]*/"), function($skip, $loc, $0, $1, $2, $3, $4, $5, $6, $7, $8, $9) {
ruleMatch('Line', $loc, $0);
return $0
});
//@ts-ignore
function Line(ctx, state) { return $EVENT(ctx, state, "Line", Line$0) }

//@ts-ignore
const IndentedBlock$0 = $TS($S(INDENT, Block, UNDENT), function($skip, $loc, $0, $1, $2, $3) {

let result = indented($2)
ruleMatch('IndentedBlock', $loc, result);
return result;
});
//@ts-ignore
function IndentedBlock(ctx, state) { return $EVENT(ctx, state, "IndentedBlock", IndentedBlock$0) }

//@ts-ignore
const Name$0 = $TR($EXPECT($R2, "Name /[A-Za-z_.-][A-Za-z0-9_.-]*/"), function($skip, $loc, $0, $1, $2, $3, $4, $5, $6, $7, $8, $9) {
ruleMatch('Name', $loc, $0);
return $0
});
//@ts-ignore
function Name(ctx, state) { return $EVENT(ctx, state, "Name", Name$0) }

//@ts-ignore
const INDENT$0 = $TR($EXPECT($R3, "INDENT /\\x0F/"), function($skip, $loc, $0, $1, $2, $3, $4, $5, $6, $7, $8, $9) {
ruleMatch('INDENT', $loc);
});
//@ts-ignore
function INDENT(ctx, state) { return $EVENT(ctx, state, "INDENT", INDENT$0) }

//@ts-ignore
const UNDENT$0 = $TR($EXPECT($R4, "UNDENT /\\x0E/"), function($skip, $loc, $0, $1, $2, $3, $4, $5, $6, $7, $8, $9) {
ruleMatch('UNDENT', $loc);
});
//@ts-ignore
function UNDENT(ctx, state) { return $EVENT(ctx, state, "UNDENT", UNDENT$0) }

//@ts-ignore
const NL$0 = $TR($EXPECT($R5, "NL /\\r?\\n/"), function($skip, $loc, $0, $1, $2, $3, $4, $5, $6, $7, $8, $9) {
ruleMatch('NL', $loc);
});
//@ts-ignore
function NL(ctx, state) { return $EVENT(ctx, state, "NL", NL$0) }

//@ts-ignore
const _$0 = $Q($EXPECT($L3, "_ \" \""))
//@ts-ignore
function _(ctx, state) { return $EVENT(ctx, state, "_", _$0) }



const parser = {
  parse: (input, options = {}) => {
    const { fail, validate, reset } = Validator()
    let ctx = { expectation: "", fail }

    if (typeof input !== "string") throw new Error("Input must be a string")

    const parser = (options.startRule != null)
      ? grammar[options.startRule]
      : Object.values(grammar)[0]

    if (!parser) throw new Error(`Could not find rule with name '${options.startRule}'`)

    const filename = options.filename || "<anonymous>";

    reset()
    Object.assign(ctx, { ...options.events, tokenize: options.tokenize });

    return validate(input, parser(ctx, {
      input,
      pos: 0,
    }), {
      filename: filename
    })
  }
}

export default parser
export const { parse } = parser

export {
  FullDesc,
  Root,
  FileDesc,
  FileName,
  DirDesc,
  DirName,
  Part,
  Block,
  Line,
  IndentedBlock,
  Name,
  INDENT,
  UNDENT,
  NL,
  _
}


import {CParseMatches} from 'parse-utils'
export let pm = new CParseMatches();
let ruleMatch = (
    name: string,
    loc: [pos: number, length: number],
    data: unknown = undefined
    ): void => {
  pm.match(name, loc, data);
  }

import {undef, defined, assert, hash} from 'datatypes';
import {indented, undented} from 'indent';

export type TFileOp = {
    op: 'clearDir' | 'compile'
    path: string
    }
  | {
    op: 'barf'
    path: string
    contents: string
    };
let lOps: TFileOp[] = [];
let lPathParts: string[] = [];

let getPath = (name: string) => {
  return [...lPathParts, name].join('/');
  };

//@ts-nocheck
