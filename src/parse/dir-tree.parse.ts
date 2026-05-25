import {
  $C,
  $E,
  $EXPECT,
  $L,
  $N,
  $P,
  $Q,
  $R,
  $R$0,
  $S,
  $TEXT,
  $Y,
  ParseError,
  SKIP,
  Validator,
  type Loc,
  type MaybeResult,
  type ParseResult,
  type Parser,
  type ParserContext,
  type ParserOptions,
  type ParseState,
  type Unwrap,
} from "npm:@danielx/hera/lib"

void {
  $C,
  $E,
  $EXPECT,
  $L,
  $N,
  $P,
  $Q,
  $R,
  $R$0,
  $S,
  $TEXT,
  $Y,
  ParseError,
  SKIP,
  Validator,
}
// Reference all imported types at value-position so TS doesn't flag them as unused.
const _types: Loc | MaybeResult<any> | ParseResult<any> | Parser<any> | ParserContext | ParserOptions<any> | ParseState | Unwrap<MaybeResult<any>> | undefined = undefined; void _types;


const grammar = {
  FullDesc,
  Root,
  FileDesc,
  DirDesc,
  DirName,
  Content,
  Block,
  IndentedBlock,
  Line,
  Name,
  INDENT,
  UNDENT,
  NL,
  _};



const grammarDefaultRule = "FullDesc";

const $skip: (typeof SKIP) = SKIP; void $skip;

const $L0 = $L("clear");
const $L1 = $L("compile");
const $L2 = $L("/");


const $R0 = $R(new RegExp("\\.(?:\\/[A-Za-z0-9_-]+)*", 'suy'));
const $R1 = $R(new RegExp("[^\\x0F\\x0E\\n\\r]*", 'suy'));
const $R2 = $R(new RegExp("[A-Za-z_.-][A-Za-z0-9_.-]+", 'suy'));
const $R3 = $R(new RegExp("\\x0F", 'suy'));
const $R4 = $R(new RegExp("\\x0E", 'suy'));
const $R5 = $R(new RegExp("\\r?\\n", 'suy'));
const $R6 = $R(new RegExp("\\x20*", 'suy'));


const FullDesc$parser = $S(Root, NL, $P($C(FileDesc, DirDesc)));

function FullDesc($$ctx: ParserContext, $$state: ParseState) {
  const $$entered = $$ctx.enter?.("FullDesc", $$state);
  if ($$entered && "cache" in $$entered) return $$entered.cache as never;
  const $$eventData = $$entered?.data;
  const $$r = FullDesc$parser($$ctx, $$state);
  if (!$$r) {
    $$ctx.exit?.("FullDesc", $$state, undefined, $$eventData);
    return undefined;
  }
  const $$m = (function($loc: Loc) {
    void $loc;
    pm.match('FullDesc', $loc);
    return pm.returnVal(lFileOps);
  })($$r.loc);
  ($$r as any).value = $$m;
  $$ctx.exit?.("FullDesc", $$state, $$r, $$eventData);
  return $$r as unknown as MaybeResult<Exclude<typeof $$m, typeof SKIP>>;
}

const Root$parser = $S($EXPECT($R0, "Root /\\.(?:\\/[A-Za-z0-9_-]+)*/"), _, $E($EXPECT($L0, "Root \"clear\"")));

function Root($$ctx: ParserContext, $$state: ParseState) {
  const $$entered = $$ctx.enter?.("Root", $$state);
  if ($$entered && "cache" in $$entered) return $$entered.cache as never;
  const $$eventData = $$entered?.data;
  const $$r = Root$parser($$ctx, $$state);
  if (!$$r) {
    $$ctx.exit?.("Root", $$state, undefined, $$eventData);
    return undefined;
  }
  const $$value = $$r.value;
  const $$m = (function($loc: Loc, $1: typeof $$value[0], $3: typeof $$value[2]) {
    void $loc, $1, $3;
    pm.match('Root', $loc);
    const root = $1[0]
    lFileOps.push({
      op: defined($3) ? 'clearDir' : 'mkDir',
      path: root
      })
    lPathParts.push(root)
    return
  })($$r.loc, $$value[0], $$value[2]);
  ($$r as any).value = $$m;
  $$ctx.exit?.("Root", $$state, $$r, $$eventData);
  return $$r as unknown as MaybeResult<Exclude<typeof $$m, typeof SKIP>>;
}

const FileDesc$parser = $S(Name, _, $E($EXPECT($L1, "FileDesc \"compile\"")), INDENT, Content, UNDENT);

function FileDesc($$ctx: ParserContext, $$state: ParseState) {
  const $$entered = $$ctx.enter?.("FileDesc", $$state);
  if ($$entered && "cache" in $$entered) return $$entered.cache as never;
  const $$eventData = $$entered?.data;
  const $$r = FileDesc$parser($$ctx, $$state);
  if (!$$r) {
    $$ctx.exit?.("FileDesc", $$state, undefined, $$eventData);
    return undefined;
  }
  const $$value = $$r.value;
  const $$m = (function($loc: Loc, $1: typeof $$value[0], $3: typeof $$value[2], $5: typeof $$value[4]) {
    void $loc, $1, $3, $5;
    pm.match('FileDesc', $loc);
    const path = getPath($1)
    lFileOps.push({
      op: 'barf',
      path,
      contents: $5
      })
    if (defined($3)) {
      lFileOps.push({
        op: 'compile',
        path
        })
    }
    return
  })($$r.loc, $$value[0], $$value[2], $$value[4]);
  ($$r as any).value = $$m;
  $$ctx.exit?.("FileDesc", $$state, $$r, $$eventData);
  return $$r as unknown as MaybeResult<Exclude<typeof $$m, typeof SKIP>>;
}

const DirDesc$parser = $S(DirName, INDENT, $P($C(DirDesc, FileDesc)), UNDENT);

function DirDesc($$ctx: ParserContext, $$state: ParseState) {
  const $$entered = $$ctx.enter?.("DirDesc", $$state);
  if ($$entered && "cache" in $$entered) return $$entered.cache as never;
  const $$eventData = $$entered?.data;
  const $$r = DirDesc$parser($$ctx, $$state);
  if (!$$r) {
    $$ctx.exit?.("DirDesc", $$state, undefined, $$eventData);
    return undefined;
  }
  const $$m = (function($loc: Loc) {
    void $loc;
    pm.match('DirDesc', $loc);
    lPathParts.pop()
    return
  })($$r.loc);
  ($$r as any).value = $$m;
  $$ctx.exit?.("DirDesc", $$state, $$r, $$eventData);
  return $$r as unknown as MaybeResult<Exclude<typeof $$m, typeof SKIP>>;
}

const DirName$parser = $S($EXPECT($L2, "DirName \"/\""), Name, _, $E($EXPECT($L0, "DirName \"clear\"")));

function DirName($$ctx: ParserContext, $$state: ParseState) {
  const $$entered = $$ctx.enter?.("DirName", $$state);
  if ($$entered && "cache" in $$entered) return $$entered.cache as never;
  const $$eventData = $$entered?.data;
  const $$r = DirName$parser($$ctx, $$state);
  if (!$$r) {
    $$ctx.exit?.("DirName", $$state, undefined, $$eventData);
    return undefined;
  }
  const $$value = $$r.value;
  const $$m = (function($loc: Loc, $2: typeof $$value[1], $4: typeof $$value[3]) {
    void $loc, $2, $4;
    pm.match('DirName', $loc);
    lPathParts.push($2)
    lFileOps.push({
      op: defined($4) ? 'clearDir' : 'mkDir',
      path: getPath()
      })
    return
  })($$r.loc, $$value[1], $$value[3]);
  ($$r as any).value = $$m;
  $$ctx.exit?.("DirName", $$state, $$r, $$eventData);
  return $$r as unknown as MaybeResult<Exclude<typeof $$m, typeof SKIP>>;
}

const Content$parser = $P(Block);

function Content($$ctx: ParserContext, $$state: ParseState) {
  const $$entered = $$ctx.enter?.("Content", $$state);
  if ($$entered && "cache" in $$entered) return $$entered.cache as never;
  const $$eventData = $$entered?.data;
  const $$r = Content$parser($$ctx, $$state);
  if (!$$r) {
    $$ctx.exit?.("Content", $$state, undefined, $$eventData);
    return undefined;
  }
  const $$m = (function($loc: Loc, $1: typeof $$r.value) {
    void $loc, $1;
    pm.match('Content', $loc);
    return pm.returnVal($1.join('\n'));
  })($$r.loc, $$r.value);
  ($$r as any).value = $$m;
  $$ctx.exit?.("Content", $$state, $$r, $$eventData);
  return $$r as unknown as MaybeResult<Exclude<typeof $$m, typeof SKIP>>;
}

const Block$parser = $S($E(NL), Line, $E(IndentedBlock));

function Block($$ctx: ParserContext, $$state: ParseState) {
  const $$entered = $$ctx.enter?.("Block", $$state);
  if ($$entered && "cache" in $$entered) return $$entered.cache as never;
  const $$eventData = $$entered?.data;
  const $$r = Block$parser($$ctx, $$state);
  if (!$$r) {
    $$ctx.exit?.("Block", $$state, undefined, $$eventData);
    return undefined;
  }
  const $$value = $$r.value;
  const $$m = (function($loc: Loc, $2: typeof $$value[1], $3: typeof $$value[2]) {
    void $loc, $2, $3;
    pm.match('Block', $loc);
    return pm.returnVal(defined($3) ? ($2 + '\n' + $3) : $2);
  })($$r.loc, $$value[1], $$value[2]);
  ($$r as any).value = $$m;
  $$ctx.exit?.("Block", $$state, $$r, $$eventData);
  return $$r as unknown as MaybeResult<Exclude<typeof $$m, typeof SKIP>>;
}

const IndentedBlock$parser = $S(INDENT, Content, UNDENT);

function IndentedBlock($$ctx: ParserContext, $$state: ParseState) {
  const $$entered = $$ctx.enter?.("IndentedBlock", $$state);
  if ($$entered && "cache" in $$entered) return $$entered.cache as never;
  const $$eventData = $$entered?.data;
  const $$r = IndentedBlock$parser($$ctx, $$state);
  if (!$$r) {
    $$ctx.exit?.("IndentedBlock", $$state, undefined, $$eventData);
    return undefined;
  }
  const $$m = (function($loc: Loc, $2: typeof $$r.value[1]) {
    void $loc, $2;
    pm.match('IndentedBlock', $loc);
    return pm.returnVal(indented($2));
  })($$r.loc, $$r.value[1]);
  ($$r as any).value = $$m;
  $$ctx.exit?.("IndentedBlock", $$state, $$r, $$eventData);
  return $$r as unknown as MaybeResult<Exclude<typeof $$m, typeof SKIP>>;
}

const Line$parser = $EXPECT($R1, "Line /[^\\x0F\\x0E\\n\\r]*/");

function Line($$ctx: ParserContext, $$state: ParseState) {
  const $$entered = $$ctx.enter?.("Line", $$state);
  if ($$entered && "cache" in $$entered) return $$entered.cache as never;
  const $$eventData = $$entered?.data;
  const $$r = Line$parser($$ctx, $$state);
  if (!$$r) {
    $$ctx.exit?.("Line", $$state, undefined, $$eventData);
    return undefined;
  }
  const $$m = (function($loc: Loc, $0: any) {
    void $loc, $0;
    pm.match('Line', $loc);
    return pm.returnVal($0);
  })($$r.loc, ($$r.value as any[])[0]);
  ($$r as any).value = $$m;
  $$ctx.exit?.("Line", $$state, $$r, $$eventData);
  return $$r as unknown as MaybeResult<Exclude<typeof $$m, typeof SKIP>>;
}

const Name$parser = $EXPECT($R2, "Name /[A-Za-z_.-][A-Za-z0-9_.-]+/");

function Name($$ctx: ParserContext, $$state: ParseState) {
  const $$entered = $$ctx.enter?.("Name", $$state);
  if ($$entered && "cache" in $$entered) return $$entered.cache as never;
  const $$eventData = $$entered?.data;
  const $$r = Name$parser($$ctx, $$state);
  if (!$$r) {
    $$ctx.exit?.("Name", $$state, undefined, $$eventData);
    return undefined;
  }
  const $$m = (function($loc: Loc, $0: any) {
    void $loc, $0;
    pm.match('Name', $loc);
    return pm.returnVal($0);
  })($$r.loc, ($$r.value as any[])[0]);
  ($$r as any).value = $$m;
  $$ctx.exit?.("Name", $$state, $$r, $$eventData);
  return $$r as unknown as MaybeResult<Exclude<typeof $$m, typeof SKIP>>;
}

const INDENT$parser = $R$0($EXPECT($R3, "INDENT /\\x0F/"));

function INDENT($$ctx: ParserContext, $$state: ParseState) {
  const $$entered = $$ctx.enter?.("INDENT", $$state);
  if ($$entered && "cache" in $$entered) return $$entered.cache as never;
  const $$eventData = $$entered?.data;
  const $$final = INDENT$parser($$ctx, $$state);
  $$ctx.exit?.("INDENT", $$state, $$final, $$eventData);

  return $$final;
}

const UNDENT$parser = $R$0($EXPECT($R4, "UNDENT /\\x0E/"));

function UNDENT($$ctx: ParserContext, $$state: ParseState) {
  const $$entered = $$ctx.enter?.("UNDENT", $$state);
  if ($$entered && "cache" in $$entered) return $$entered.cache as never;
  const $$eventData = $$entered?.data;
  const $$final = UNDENT$parser($$ctx, $$state);
  $$ctx.exit?.("UNDENT", $$state, $$final, $$eventData);

  return $$final;
}

const NL$parser = $R$0($EXPECT($R5, "NL /\\r?\\n/"));

function NL($$ctx: ParserContext, $$state: ParseState) {
  const $$entered = $$ctx.enter?.("NL", $$state);
  if ($$entered && "cache" in $$entered) return $$entered.cache as never;
  const $$eventData = $$entered?.data;
  const $$final = NL$parser($$ctx, $$state);
  $$ctx.exit?.("NL", $$state, $$final, $$eventData);

  return $$final;
}

const _$parser = $R$0($EXPECT($R6, "_ /\\x20*/"));

function _($$ctx: ParserContext, $$state: ParseState) {
  const $$entered = $$ctx.enter?.("_", $$state);
  if ($$entered && "cache" in $$entered) return $$entered.cache as never;
  const $$eventData = $$entered?.data;
  const $$final = _$parser($$ctx, $$state);
  $$ctx.exit?.("_", $$state, $$final, $$eventData);

  return $$final;
}



type Grammar = typeof grammar;
type GrammarDefaultRule = typeof grammarDefaultRule;
type ParserResult<P> = P extends Parser<infer T> ? T : never;

const parser = (function() {
  const { fail, validate, reset } = Validator()
  let ctx: ParserContext = { expectation: "", fail }

  return {
    parse: <K extends keyof Grammar = GrammarDefaultRule,>(
      input: string,
      options: ParserOptions<Grammar> & { startRule?: K } = {}
    ) => {
      if (typeof input !== "string") throw new Error("Input must be a string")

      let parser
      if (options.startRule !== null && options.startRule !== undefined) {
        parser = grammar[options.startRule] as Parser<ParserResult<Grammar[K]>>
      }
      else {
        parser = Object.values(grammar)[0] as Parser<ParserResult<Grammar[K]>>
      }

      if (!parser) throw new Error(`Could not find rule with name '${options.startRule}'`)

      const filename = options.filename || "<anonymous>";

      reset()
      Object.assign(ctx, { ...options.events });

      return validate(input, parser(ctx, {
        input,
        pos: 0,
      }), {
        filename: filename
      })
    }
  }
}())

export default parser
export const { parse } = parser

export {
  FullDesc,
  Root,
  FileDesc,
  DirDesc,
  DirName,
  Content,
  Block,
  IndentedBlock,
  Line,
  Name,
  INDENT,
  UNDENT,
  NL,
  _
}


import {CParseMatches} from 'parse-utils';
export let pm = new CParseMatches();

import {undef, defined, assert} from 'base'
import {hash} from 'datatypes'
import {indented, undented} from 'indent'

export type TFileOp = {
    op: 'clearDir' | 'compile'
    path: string
    }
  | {
    op: 'barf'
    path: string
    contents: string
    }

const lFileOps: TFileOp[]  = []
const lPathParts: string[] = []

const getPath = (fileName: string = '') => {
  if (fileName) {
    return [...lPathParts, fileName].join('/')
  }
  else {
    return [...lPathParts].join('/')
  }
}

export const beginParse = (text: string): (string | undefined) => {
  lFileOps.length  = 0
  lPathParts.length = 0

  return str2indents(text)
  }
