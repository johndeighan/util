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
  AllBlocks,
  Block,
  Name,
  Content,
  Args,
  Line,
  INDENT,
  UNDENT,
  NL,
  WS};



const grammarDefaultRule = "AllBlocks";

const $skip: (typeof SKIP) = SKIP; void $skip;

const $L0 = $L("\x23");


const $R0 = $R(new RegExp("[A-Za-z_][A-Za-z0-9_]*", 'suy'));
const $R1 = $R(new RegExp("[^\\n\\r\\x0F\\x0E]*", 'suy'));
const $R2 = $R(new RegExp("[^\\n\\r\\x0F\\x0E]+", 'suy'));
const $R3 = $R(new RegExp("\\x0F", 'suy'));
const $R4 = $R(new RegExp("\\x0E", 'suy'));
const $R5 = $R(new RegExp("\\r?\\n", 'suy'));
const $R6 = $R(new RegExp("\\x20*", 'suy'));


const AllBlocks$parser = $S($Q(Block), $Q(NL));

function AllBlocks($$ctx: ParserContext, $$state: ParseState) {
  const $$entered = $$ctx.enter?.("AllBlocks", $$state);
  if ($$entered && "cache" in $$entered) return $$entered.cache as never;
  const $$eventData = $$entered?.data;
  const $$r = AllBlocks$parser($$ctx, $$state);
  if (!$$r) {
    $$ctx.exit?.("AllBlocks", $$state, undefined, $$eventData);
    return undefined;
  }
  const $$m = (function($loc: Loc, $1: typeof $$r.value[0]) {
    void $loc, $1;
    pm.match('AllBlocks', $loc);
    return pm.returnVal($1);
  })($$r.loc, $$r.value[0]);
  ($$r as any).value = $$m;
  $$ctx.exit?.("AllBlocks", $$state, $$r, $$eventData);
  return $$r as unknown as MaybeResult<Exclude<typeof $$m, typeof SKIP>>;
}

const Block$0$parser = $S($EXPECT($L0, "Block \"\\\\x23\""), Name, WS, Args, NL, $E(Content));

const Block$1$parser = $S(Line, NL, $E(Content));

function Block$0($$ctx: ParserContext, $$state: ParseState) {
  const $$r = Block$0$parser($$ctx, $$state);
  if (!$$r) {
    
    return undefined;
  }
  const $$value = $$r.value;
  const $$m = (function($loc: Loc, $2: typeof $$value[1], $4: typeof $$value[3], $6: typeof $$value[5]) {
    void $loc, $2, $4, $6;
    pm.match('Block', $loc);
    const lContent = defined($6) ? $6 : []
    return pm.returnVal({type: 'macro', name: $2, args: $4, lContent} as TMacroBlock);
  })($$r.loc, $$value[1], $$value[3], $$value[5]);
  ($$r as any).value = $$m;
  
  return $$r as unknown as MaybeResult<Exclude<typeof $$m, typeof SKIP>>;
}

function Block$1($$ctx: ParserContext, $$state: ParseState) {
  const $$r = Block$1$parser($$ctx, $$state);
  if (!$$r) {
    
    return undefined;
  }
  const $$value = $$r.value;
  const $$m = (function($loc: Loc, $1: typeof $$value[0], $3: typeof $$value[2]) {
    void $loc, $1, $3;
    pm.match('Block', $loc);
    const lContent = defined($3) ? $3 : []
    return pm.returnVal({type: 'text', firstLine: $1, lContent} as TTextBlock);
  })($$r.loc, $$value[0], $$value[2]);
  ($$r as any).value = $$m;
  
  return $$r as unknown as MaybeResult<Exclude<typeof $$m, typeof SKIP>>;
}

function Block($$ctx: ParserContext, $$state: ParseState) {
  const $$entered = $$ctx.enter?.("Block", $$state);
  if ($$entered && "cache" in $$entered) return $$entered.cache as never;
  const $$eventData = $$entered?.data;
  const $$final: MaybeResult<Unwrap<ReturnType<typeof Block$0>> | Unwrap<ReturnType<typeof Block$1>>> = Block$0($$ctx, $$state)
    || Block$1($$ctx, $$state);
  $$ctx.exit?.("Block", $$state, $$final, $$eventData);

  return $$final;
}

const Name$parser = $EXPECT($R0, "Name /[A-Za-z_][A-Za-z0-9_]*/");

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
    const name = $0
    assert(!name.startsWith('#'))
    return pm.returnVal(name);
  })($$r.loc, ($$r.value as any[])[0]);
  ($$r as any).value = $$m;
  $$ctx.exit?.("Name", $$state, $$r, $$eventData);
  return $$r as unknown as MaybeResult<Exclude<typeof $$m, typeof SKIP>>;
}

const Content$parser = $S(INDENT, $P(Block), UNDENT);

function Content($$ctx: ParserContext, $$state: ParseState) {
  const $$entered = $$ctx.enter?.("Content", $$state);
  if ($$entered && "cache" in $$entered) return $$entered.cache as never;
  const $$eventData = $$entered?.data;
  const $$r = Content$parser($$ctx, $$state);
  if (!$$r) {
    $$ctx.exit?.("Content", $$state, undefined, $$eventData);
    return undefined;
  }
  const $$m = (function($loc: Loc, $2: typeof $$r.value[1]) {
    void $loc, $2;
    pm.match('Content', $loc);
    return pm.returnVal($2);
  })($$r.loc, $$r.value[1]);
  ($$r as any).value = $$m;
  $$ctx.exit?.("Content", $$state, $$r, $$eventData);
  return $$r as unknown as MaybeResult<Exclude<typeof $$m, typeof SKIP>>;
}

const Args$parser = $EXPECT($R1, "Args /[^\\n\\r\\x0F\\x0E]*/");

function Args($$ctx: ParserContext, $$state: ParseState) {
  const $$entered = $$ctx.enter?.("Args", $$state);
  if ($$entered && "cache" in $$entered) return $$entered.cache as never;
  const $$eventData = $$entered?.data;
  const $$r = Args$parser($$ctx, $$state);
  if (!$$r) {
    $$ctx.exit?.("Args", $$state, undefined, $$eventData);
    return undefined;
  }
  const $$m = (function($loc: Loc, $0: any) {
    void $loc, $0;
    pm.match('Args', $loc);
    return pm.returnVal($0);
  })($$r.loc, ($$r.value as any[])[0]);
  ($$r as any).value = $$m;
  $$ctx.exit?.("Args", $$state, $$r, $$eventData);
  return $$r as unknown as MaybeResult<Exclude<typeof $$m, typeof SKIP>>;
}

const Line$parser = $EXPECT($R2, "Line /[^\\n\\r\\x0F\\x0E]+/");

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
    assert(defined($0), "result not defined!!!")
    return pm.returnVal($0);
  })($$r.loc, ($$r.value as any[])[0]);
  ($$r as any).value = $$m;
  $$ctx.exit?.("Line", $$state, $$r, $$eventData);
  return $$r as unknown as MaybeResult<Exclude<typeof $$m, typeof SKIP>>;
}

const INDENT$parser = $EXPECT($R3, "INDENT /\\x0F/");

function INDENT($$ctx: ParserContext, $$state: ParseState) {
  const $$entered = $$ctx.enter?.("INDENT", $$state);
  if ($$entered && "cache" in $$entered) return $$entered.cache as never;
  const $$eventData = $$entered?.data;
  const $$r = INDENT$parser($$ctx, $$state);
  if (!$$r) {
    $$ctx.exit?.("INDENT", $$state, undefined, $$eventData);
    return undefined;
  }
  const $$m = (function($loc: Loc) {
    void $loc;
    pm.match('INDENT', $loc);
  })($$r.loc);
  ($$r as any).value = $$m;
  $$ctx.exit?.("INDENT", $$state, $$r, $$eventData);
  return $$r as unknown as MaybeResult<Exclude<typeof $$m, typeof SKIP>>;
}

const UNDENT$parser = $EXPECT($R4, "UNDENT /\\x0E/");

function UNDENT($$ctx: ParserContext, $$state: ParseState) {
  const $$entered = $$ctx.enter?.("UNDENT", $$state);
  if ($$entered && "cache" in $$entered) return $$entered.cache as never;
  const $$eventData = $$entered?.data;
  const $$r = UNDENT$parser($$ctx, $$state);
  if (!$$r) {
    $$ctx.exit?.("UNDENT", $$state, undefined, $$eventData);
    return undefined;
  }
  const $$m = (function($loc: Loc) {
    void $loc;
    pm.match('UNDENT', $loc);
  })($$r.loc);
  ($$r as any).value = $$m;
  $$ctx.exit?.("UNDENT", $$state, $$r, $$eventData);
  return $$r as unknown as MaybeResult<Exclude<typeof $$m, typeof SKIP>>;
}

const NL$parser = $EXPECT($R5, "NL /\\r?\\n/");

function NL($$ctx: ParserContext, $$state: ParseState) {
  const $$entered = $$ctx.enter?.("NL", $$state);
  if ($$entered && "cache" in $$entered) return $$entered.cache as never;
  const $$eventData = $$entered?.data;
  const $$r = NL$parser($$ctx, $$state);
  if (!$$r) {
    $$ctx.exit?.("NL", $$state, undefined, $$eventData);
    return undefined;
  }
  const $$m = (function($loc: Loc) {
    void $loc;
    pm.match('NL', $loc);
  })($$r.loc);
  ($$r as any).value = $$m;
  $$ctx.exit?.("NL", $$state, $$r, $$eventData);
  return $$r as unknown as MaybeResult<Exclude<typeof $$m, typeof SKIP>>;
}

const WS$parser = $EXPECT($R6, "WS /\\x20*/");

function WS($$ctx: ParserContext, $$state: ParseState) {
  const $$entered = $$ctx.enter?.("WS", $$state);
  if ($$entered && "cache" in $$entered) return $$entered.cache as never;
  const $$eventData = $$entered?.data;
  const $$r = WS$parser($$ctx, $$state);
  if (!$$r) {
    $$ctx.exit?.("WS", $$state, undefined, $$eventData);
    return undefined;
  }
  const $$m = (function($loc: Loc) {
    void $loc;
    pm.match('WS', $loc);
  })($$r.loc);
  ($$r as any).value = $$m;
  $$ctx.exit?.("WS", $$state, $$r, $$eventData);
  return $$r as unknown as MaybeResult<Exclude<typeof $$m, typeof SKIP>>;
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
  AllBlocks,
  Block,
  Name,
  Content,
  Args,
  Line,
  INDENT,
  UNDENT,
  NL,
  WS
}


import {CParseMatches} from 'parse-utils';
export let pm = new CParseMatches();

import {defined, notdefined, assert} from 'base'
import {str2indents} from 'hera-parse'
import {
  TTextBlock, TMacroBlock, splitMacroHeader,
  } from 'macros'

export const beginParse = (
    text: string,
    hOptions: {[key: string|symbol]: unknown} = {}
    ): string|undefined => {
  pm.reset(text);
  return str2indents(text)
  }
