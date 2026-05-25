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
  Contents,
  Block,
  Line,
  INDENT,
  UNDENT,
  NL};



const grammarDefaultRule = "Contents";

const $skip: (typeof SKIP) = SKIP; void $skip;



const $R0 = $R(new RegExp("[^\\n\\x0F\\x0E]+", 'suy'));
const $R1 = $R(new RegExp("\\x0F", 'suy'));
const $R2 = $R(new RegExp("\\x0E", 'suy'));
const $R3 = $R(new RegExp("\\r?\\n", 'suy'));


const Contents$parser = $S($Q(Block), $Q(NL));

function Contents($$ctx: ParserContext, $$state: ParseState) {
  const $$entered = $$ctx.enter?.("Contents", $$state);
  if ($$entered && "cache" in $$entered) return $$entered.cache as never;
  const $$eventData = $$entered?.data;
  const $$r = Contents$parser($$ctx, $$state);
  if (!$$r) {
    $$ctx.exit?.("Contents", $$state, undefined, $$eventData);
    return undefined;
  }
  const $$m = (function($loc: Loc, $1: typeof $$r.value[0]) {
    void $loc, $1;
    pm.match('Contents', $loc);
    for (const blk in $1) {
      mainBlock.add(blk)
    }
    return pm.returnVal(mainBlock);
  })($$r.loc, $$r.value[0]);
  ($$r as any).value = $$m;
  $$ctx.exit?.("Contents", $$state, $$r, $$eventData);
  return $$r as unknown as MaybeResult<Exclude<typeof $$m, typeof SKIP>>;
}

const Block$0$parser = $S(Line, NL);

const Block$1$parser = $S(Line, INDENT, $P(Block), UNDENT);

function Block$0($$ctx: ParserContext, $$state: ParseState) {
  const $$r = Block$0$parser($$ctx, $$state);
  if (!$$r) {
    
    return undefined;
  }
  const $$m = (function($loc: Loc, $1: typeof $$r.value[0]) {
    void $loc, $1;
    pm.match('Block', $loc);
    return pm.returnVal(new CBlock($1));
  })($$r.loc, $$r.value[0]);
  ($$r as any).value = $$m;
  
  return $$r as unknown as MaybeResult<Exclude<typeof $$m, typeof SKIP>>;
}

function Block$1($$ctx: ParserContext, $$state: ParseState) {
  const $$r = Block$1$parser($$ctx, $$state);
  if (!$$r) {
    
    return undefined;
  }
  const $$value = $$r.value;
  const $$m = (function($loc: Loc, $1: typeof $$value[0], $2: typeof $$value[1]) {
    void $loc, $1, $2;
    pm.match('Block', $loc);
    const blk = new CBlock($1)
    for (const sub of $2[1]) {
      blk.add(sub)
    }
    return pm.returnVal(blk);
  })($$r.loc, $$value[0], $$value[1]);
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

const Line$parser = $EXPECT($R0, "Line /[^\\n\\x0F\\x0E]+/");

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

const INDENT$parser = $R$0($EXPECT($R1, "INDENT /\\x0F/"));

function INDENT($$ctx: ParserContext, $$state: ParseState) {
  const $$entered = $$ctx.enter?.("INDENT", $$state);
  if ($$entered && "cache" in $$entered) return $$entered.cache as never;
  const $$eventData = $$entered?.data;
  const $$final = INDENT$parser($$ctx, $$state);
  $$ctx.exit?.("INDENT", $$state, $$final, $$eventData);

  return $$final;
}

const UNDENT$parser = $R$0($EXPECT($R2, "UNDENT /\\x0E/"));

function UNDENT($$ctx: ParserContext, $$state: ParseState) {
  const $$entered = $$ctx.enter?.("UNDENT", $$state);
  if ($$entered && "cache" in $$entered) return $$entered.cache as never;
  const $$eventData = $$entered?.data;
  const $$final = UNDENT$parser($$ctx, $$state);
  $$ctx.exit?.("UNDENT", $$state, $$final, $$eventData);

  return $$final;
}

const NL$parser = $R$0($EXPECT($R3, "NL /\\r?\\n/"));

function NL($$ctx: ParserContext, $$state: ParseState) {
  const $$entered = $$ctx.enter?.("NL", $$state);
  if ($$entered && "cache" in $$entered) return $$entered.cache as never;
  const $$eventData = $$entered?.data;
  const $$final = NL$parser($$ctx, $$state);
  $$ctx.exit?.("NL", $$state, $$final, $$eventData);

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
  Contents,
  Block,
  Line,
  INDENT,
  UNDENT,
  NL
}


import {CParseMatches} from 'parse-utils';
export let pm = new CParseMatches();

import {undef, defined, assert} from 'base'
import {isArray} from 'datatypes'
import {CBlock} from 'block'

const mainBlock = new CBlock()

export const beginParse = (text: string): (string | undefined) =>( {
  reset: mainBlock.reset()
  })
