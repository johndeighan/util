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
  AllSymbols,
  LibBlock,
  Line,
  Name,
  INDENT,
  UNDENT,
  _,
  NL};



const grammarDefaultRule = "AllSymbols";

const $skip: (typeof SKIP) = SKIP; void $skip;

const $L0 = $L(" ");


const $R0 = $R(new RegExp("[A-Za-z_][A-Za-z0-9_]*", 'suy'));
const $R1 = $R(new RegExp("\\x0F", 'suy'));
const $R2 = $R(new RegExp("\\x0E", 'suy'));
const $R3 = $R(new RegExp("\\r?\\n", 'suy'));


const AllSymbols$parser = $S($P(LibBlock), $Q(NL));

function AllSymbols($$ctx: ParserContext, $$state: ParseState) {
  const $$entered = $$ctx.enter?.("AllSymbols", $$state);
  if ($$entered && "cache" in $$entered) return $$entered.cache as never;
  const $$eventData = $$entered?.data;
  const $$r = AllSymbols$parser($$ctx, $$state);
  if (!$$r) {
    $$ctx.exit?.("AllSymbols", $$state, undefined, $$eventData);
    return undefined;
  }
  const $$m = (function($loc: Loc) {
    void $loc;
    pm.match('AllSymbols', $loc);
    return pm.returnVal(hSymbols);
  })($$r.loc);
  ($$r as any).value = $$m;
  $$ctx.exit?.("AllSymbols", $$state, $$r, $$eventData);
  return $$r as unknown as MaybeResult<Exclude<typeof $$m, typeof SKIP>>;
}

const LibBlock$parser = $S(Name, NL, INDENT, $P(Line), UNDENT);

function LibBlock($$ctx: ParserContext, $$state: ParseState) {
  const $$entered = $$ctx.enter?.("LibBlock", $$state);
  if ($$entered && "cache" in $$entered) return $$entered.cache as never;
  const $$eventData = $$entered?.data;
  const $$r = LibBlock$parser($$ctx, $$state);
  if (!$$r) {
    $$ctx.exit?.("LibBlock", $$state, undefined, $$eventData);
    return undefined;
  }
  const $$value = $$r.value;
  const $$m = (function($loc: Loc, $1: typeof $$value[0], $4: typeof $$value[3]) {
    void $loc, $1, $4;
    pm.match('LibBlock', $loc);
    for (const lNames of $4) {
      for (const name of lNames) {
        addSymbol(name, $1)
      }
    }
    return
  })($$r.loc, $$value[0], $$value[3]);
  ($$r as any).value = $$m;
  $$ctx.exit?.("LibBlock", $$state, $$r, $$eventData);
  return $$r as unknown as MaybeResult<Exclude<typeof $$m, typeof SKIP>>;
}

const Line$parser = $S(Name, $Q($S(_, Name)), NL);

function Line($$ctx: ParserContext, $$state: ParseState) {
  const $$entered = $$ctx.enter?.("Line", $$state);
  if ($$entered && "cache" in $$entered) return $$entered.cache as never;
  const $$eventData = $$entered?.data;
  const $$r = Line$parser($$ctx, $$state);
  if (!$$r) {
    $$ctx.exit?.("Line", $$state, undefined, $$eventData);
    return undefined;
  }
  const $$value = $$r.value;
  const $$m = (function($loc: Loc, $1: typeof $$value[0], $2: typeof $$value[1]) {
    void $loc, $1, $2;
    pm.match('Line', $loc);
    const lNames: string[] = [$1]
    for (const [pre, name] of $2) {
      lNames.push(name)
    }
    return pm.returnVal(lNames);
  })($$r.loc, $$value[0], $$value[1]);
  ($$r as any).value = $$m;
  $$ctx.exit?.("Line", $$state, $$r, $$eventData);
  return $$r as unknown as MaybeResult<Exclude<typeof $$m, typeof SKIP>>;
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
    return pm.returnVal($0);
  })($$r.loc, ($$r.value as any[])[0]);
  ($$r as any).value = $$m;
  $$ctx.exit?.("Name", $$state, $$r, $$eventData);
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

const _$parser = $Q($EXPECT($L0, "_ \" \""));

function _($$ctx: ParserContext, $$state: ParseState) {
  const $$entered = $$ctx.enter?.("_", $$state);
  if ($$entered && "cache" in $$entered) return $$entered.cache as never;
  const $$eventData = $$entered?.data;
  const $$final = _$parser($$ctx, $$state);
  $$ctx.exit?.("_", $$state, $$final, $$eventData);

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
  AllSymbols,
  LibBlock,
  Line,
  Name,
  INDENT,
  UNDENT,
  _,
  NL
}


import {CParseMatches} from 'parse-utils';
export let pm = new CParseMatches();

import {clearSymbols, addSymbol, hSymbols} from "symbols"
import {str2indents} from 'hera-parse'

export const beginParse = (text: string): (string | undefined) => {
  clearSymbols()
  return str2indents(text) + '\n'
  }
