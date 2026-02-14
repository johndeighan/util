// @ts-nocheck
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
Contents: Contents,
IndentedBlock: IndentedBlock,
Block: Block,
Line: Line,
DirDesc: DirDesc,
DirName: DirName,
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


const $R0 = $R(new RegExp("\\.(?:\\/[A-Za-z0-9_-]+)*", 'suy'));
const $R1 = $R(new RegExp("[^\\x0F\\x0E\\n\\r]*", 'suy'));
const $R2 = $R(new RegExp("[A-Za-z_.-][A-Za-z0-9_.-]*", 'suy'));
const $R3 = $R(new RegExp("\\x0F", 'suy'));
const $R4 = $R(new RegExp("\\x0E", 'suy'));
const $R5 = $R(new RegExp("\\r?\\n", 'suy'));
const $R6 = $R(new RegExp("\\x20*", 'suy'));


//@ts-ignore
const FullDesc$0 = $TS($S(Root, $P($C(FileDesc, DirDesc))), function($skip, $loc, $0, $1, $2) {

pm.match('FullDesc', $loc);
return lFileOps;
});
//@ts-ignore
function FullDesc(ctx, state) { return $EVENT(ctx, state, "FullDesc", FullDesc$0) }

//@ts-ignore
const Root$0 = $TS($S($EXPECT($R0, "Root /\\.(?:\\/[A-Za-z0-9_-]+)*/"), _, $E($EXPECT($L0, "Root \"clear\"")), NL), function($skip, $loc, $0, $1, $2, $3, $4) {

pm.match('Root', $loc);
let root = $1[0];
lFileOps.push({
  op: defined($3) ? 'clearDir' : 'mkDir',
  path: root
  });
lPathParts = [root];
return;
});
//@ts-ignore
function Root(ctx, state) { return $EVENT(ctx, state, "Root", Root$0) }

//@ts-ignore
const FileDesc$0 = $TS($S(FileName, Contents), function($skip, $loc, $0, $1, $2) {

pm.match('FileDesc', $loc);
let [fileName, doCompile] = $1;
let path = getPath(fileName);
lFileOps.push({
  op: 'barf',
  path,
  contents: $2
  });
if (doCompile) {
  lFileOps.push({
    op: 'compile',
    path
    });
  }
});
//@ts-ignore
function FileDesc(ctx, state) { return $EVENT(ctx, state, "FileDesc", FileDesc$0) }

//@ts-ignore
const FileName$0 = $TS($S(Name, _, $E($EXPECT($L1, "FileName \"compile\"")), NL), function($skip, $loc, $0, $1, $2, $3, $4) {

pm.match('FileName', $loc);
return [$1, defined($3)]
});
//@ts-ignore
function FileName(ctx, state) { return $EVENT(ctx, state, "FileName", FileName$0) }

//@ts-ignore
const Contents$0 = $TS($S(IndentedBlock), function($skip, $loc, $0, $1) {

pm.match('Contents', $loc);
return undented($1);
});
//@ts-ignore
function Contents(ctx, state) { return $EVENT(ctx, state, "Contents", Contents$0) }

//@ts-ignore
const IndentedBlock$0 = $TS($S(INDENT, $P(Block), UNDENT), function($skip, $loc, $0, $1, $2, $3) {

pm.match('IndentedBlock', $loc);
return indented($2.join('\n'));
});
//@ts-ignore
function IndentedBlock(ctx, state) { return $EVENT(ctx, state, "IndentedBlock", IndentedBlock$0) }

//@ts-ignore
const Block$0 = $TS($S(Line, $E(IndentedBlock)), function($skip, $loc, $0, $1, $2) {

pm.match('Block', $loc);
if (defined($2)) {
  return $1 + '\n' + $2;
  }
else {
  return $1;
  }
});
//@ts-ignore
function Block(ctx, state) { return $EVENT(ctx, state, "Block", Block$0) }

//@ts-ignore
const Line$0 = $TS($S($EXPECT($R1, "Line /[^\\x0F\\x0E\\n\\r]*/"), NL), function($skip, $loc, $0, $1, $2) {

pm.match('Line', $loc);
return $1
});
//@ts-ignore
function Line(ctx, state) { return $EVENT(ctx, state, "Line", Line$0) }

//@ts-ignore
const DirDesc$0 = $TS($S(DirName, NL, INDENT, $P($C(DirDesc, FileDesc)), UNDENT), function($skip, $loc, $0, $1, $2, $3, $4, $5) {

pm.match('DirDesc', $loc);
lPathParts.pop()
return
});
//@ts-ignore
function DirDesc(ctx, state) { return $EVENT(ctx, state, "DirDesc", DirDesc$0) }

//@ts-ignore
const DirName$0 = $TS($S($EXPECT($L2, "DirName \"/\""), Name, _, $E($EXPECT($L0, "DirName \"clear\""))), function($skip, $loc, $0, $1, $2, $3, $4) {

pm.match('DirName', $loc);
lPathParts.push($2);
lFileOps.push({
  op: defined($4) ? 'clearDir' : 'mkDir',
  path: getPath()
  });
});
//@ts-ignore
function DirName(ctx, state) { return $EVENT(ctx, state, "DirName", DirName$0) }

//@ts-ignore
const Name$0 = $TR($EXPECT($R2, "Name /[A-Za-z_.-][A-Za-z0-9_.-]*/"), function($skip, $loc, $0, $1, $2, $3, $4, $5, $6, $7, $8, $9) {
pm.match('Name', $loc);
return $0
});
//@ts-ignore
function Name(ctx, state) { return $EVENT(ctx, state, "Name", Name$0) }

//@ts-ignore
const INDENT$0 = $R$0($EXPECT($R3, "INDENT /\\x0F/"))
//@ts-ignore
function INDENT(ctx, state) { return $EVENT(ctx, state, "INDENT", INDENT$0) }

//@ts-ignore
const UNDENT$0 = $R$0($EXPECT($R4, "UNDENT /\\x0E/"))
//@ts-ignore
function UNDENT(ctx, state) { return $EVENT(ctx, state, "UNDENT", UNDENT$0) }

//@ts-ignore
const NL$0 = $R$0($EXPECT($R5, "NL /\\r?\\n/"))
//@ts-ignore
function NL(ctx, state) { return $EVENT(ctx, state, "NL", NL$0) }

//@ts-ignore
const _$0 = $R$0($EXPECT($R6, "_ /\\x20*/"))
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
  Contents,
  IndentedBlock,
  Block,
  Line,
  DirDesc,
  DirName,
  Name,
  INDENT,
  UNDENT,
  NL,
  _
}


import {CParseMatches} from 'parse-utils';
export let pm = new CParseMatches();

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

let lFileOps: TFileOp[] = [];
let lPathParts: string[] = [];

export const reset = (): void => {
  lFileOps.length = 0;
  pm.reset();
  }

const getPath = (fileName: string = '') => {
  if (fileName) {
    return [...lPathParts, fileName].join('/');
    }
  else {
    return [...lPathParts].join('/');
    }
  };


// @ts-nocheck
