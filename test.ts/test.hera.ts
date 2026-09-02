const {
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
  Parser,
  SKIP,
  Validator
} = require("@danielx/hera/lib")


const grammar = {
  Main1};



const grammarDefaultRule = "Main1";

const $skip = SKIP; void $skip;



const $R0 = $R(new RegExp("abc", 'suy'));


const Main1$parser = $EXPECT($R0, "Main1 /abc/");

function Main1($$ctx, $$state) {
  const $$entered = $$ctx.enter?.("Main1", $$state);
  if ($$entered && "cache" in $$entered) return $$entered.cache;
  const $$eventData = $$entered?.data;
  const $$r = Main1$parser($$ctx, $$state);
  if (!$$r) {
    $$ctx.exit?.("Main1", $$state, undefined, $$eventData);
    return undefined;
  }
  const $$m = (function($loc) {
    pm.match('Main1', $loc);
  })($$r.loc);
  ($$r).value = $$m;
  $$ctx.exit?.("Main1", $$state, $$r, $$eventData);
  return $$r;
}



const parser = {
  parse: (input, options = {}) => {
    const { fail, validate, reset } = Validator()
    let ctx = { expectation: "", fail }

    if (typeof input !== "string") throw new Error("Input must be a string")

    let parser
    if (options.startRule !== null && options.startRule !== undefined)
      parser = grammar[options.startRule]
    else
      parser = Object.values(grammar)[0]

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

exports.default = parser
const parse = exports.parse = parser.parse
void parse /* make TS ok if we don't use this variable */

exports.Main1 = Main1;


import {CParseMatches} from 'parse-utils';
export let pm = new CParseMatches();

const name = 'John Deighan'
const lItems: string[] = []

export const beginParse = (
    text: string,
    hOptions: {[key: string|symbol]: unknown} = {}
    ): string|undefined => {
  pm.reset(text);
  lItems.length = 0
  }
