"use strict";
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
  Program};



const grammarDefaultRule = "Program";

const $skip: (typeof SKIP) = SKIP; void $skip;

const $L0 = $L("a");
const $L1 = $L("b");




const Program$parser = $S($Q($EXPECT($L0, "Program \"a\"")), $Q($EXPECT($L1, "Program \"b\"")));

function Program($$ctx: ParserContext, $$state: ParseState) {
  const $$entered = $$ctx.enter?.("Program", $$state);
  if ($$entered && "cache" in $$entered) return $$entered.cache as never;
  const $$eventData = $$entered?.data;
  const $$r = Program$parser($$ctx, $$state);
  if (!$$r) {
    $$ctx.exit?.("Program", $$state, undefined, $$eventData);
    return undefined;
  }
  const $$value = $$r.value;
  const $$m = (function($loc: Loc, $1: typeof $$value[0], $2: typeof $$value[1]) {
    void $loc, $1, $2;
    pm.match('Program', $loc);
    return pm.returnVal(($1.length - $2.length));
  })($$r.loc, $$value[0], $$value[1]);
  ($$r as any).value = $$m;
  $$ctx.exit?.("Program", $$state, $$r, $$eventData);
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
  Program
}


import {CParseMatches} from 'parse-utils';
export let pm = new CParseMatches();

export const beginParse = (
    text: string,
    hOptions: {[key: string|symbol]: unknown} = {}
    ): string|undefined => {
  pm.reset(text);

  }
