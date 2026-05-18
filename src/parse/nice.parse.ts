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
  Value,
  Primitive,
  Array,
  ArrayItem,
  Hash,
  HashItem,
  Key,
  Special,
  INDENT,
  UNDENT,
  NL};



const grammarDefaultRule = "Value";

const $skip: (typeof SKIP) = SKIP; void $skip;

const $L0 = $L("｟");
const $L1 = $L("｠");
const $L2 = $L("n");
const $L3 = $L("- ");
const $L4 = $L("-");
const $L5 = $L(": ");
const $L6 = $L(":");
const $L7 = $L("undef");
const $L8 = $L("null");
const $L9 = $L("true");
const $L10 = $L("false");
const $L11 = $L("emptyArray");
const $L12 = $L("emptyHash");
const $L13 = $L("emptySet");
const $L14 = $L("emptyMap");
const $L15 = $L("NaN");
const $L16 = $L("inf");
const $L17 = $L("neginf");
const $L18 = $L("symbol");


const $R0 = $R(new RegExp("\\d+", 'suy'));
const $R1 = $R(new RegExp("\\d+\\.\\d*", 'suy'));
const $R2 = $R(new RegExp("[^\\n]+", 'suy'));
const $R3 = $R(new RegExp("[A-Za-z]+", 'suy'));
const $R4 = $R(new RegExp("[^｠]*", 'suy'));
const $R5 = $R(new RegExp("\\x0F", 'suy'));
const $R6 = $R(new RegExp("\\x0E", 'suy'));
const $R7 = $R(new RegExp("\\r?\\n", 'suy'));


const Value$parser = $C(Primitive, Array, Hash);

function Value($$ctx: ParserContext, $$state: ParseState) {
  const $$entered = $$ctx.enter?.("Value", $$state);
  if ($$entered && "cache" in $$entered) return $$entered.cache as never;
  const $$eventData = $$entered?.data;
  const $$r = Value$parser($$ctx, $$state);
  if (!$$r) {
    $$ctx.exit?.("Value", $$state, undefined, $$eventData);
    return undefined;
  }
  const $$m = (function($loc: Loc) {
    void $loc;
    pm.match('Value', $loc);
    return $2
  })($$r.loc);
  ($$r as any).value = $$m;
  $$ctx.exit?.("Value", $$state, $$r, $$eventData);
  return $$r as unknown as MaybeResult<Exclude<typeof $$m, typeof SKIP>>;
}

const Primitive$0$parser = $S($EXPECT($L0, "Primitive \"｟\""), Special, $EXPECT($L1, "Primitive \"｠\""));

const Primitive$1$parser = $S($EXPECT($R0, "Primitive /\\d+/"), $E($EXPECT($L2, "Primitive \"n\"")));

const Primitive$2$parser = $EXPECT($R1, "Primitive /\\d+\\.\\d*/");

const Primitive$3$parser = $EXPECT($R2, "Primitive /[^\\n]+/");

function Primitive$0($$ctx: ParserContext, $$state: ParseState) {
  const $$r = Primitive$0$parser($$ctx, $$state);
  if (!$$r) {
    
    return undefined;
  }
  const $$m = (function($loc: Loc, $2: typeof $$r.value[1]) {
    void $loc, $2;
    pm.match('Primitive', $loc);
    return $2
  })($$r.loc, $$r.value[1]);
  ($$r as any).value = $$m;
  
  return $$r as unknown as MaybeResult<Exclude<typeof $$m, typeof SKIP>>;
}

function Primitive$1($$ctx: ParserContext, $$state: ParseState) {
  const $$r = Primitive$1$parser($$ctx, $$state);
  if (!$$r) {
    
    return undefined;
  }
  const $$value = $$r.value;
  const $$m = (function($loc: Loc, $0: typeof $$value, $1: typeof $$value[0], $2: typeof $$value[1]) {
    void $loc, $0, $1, $2;
    pm.match('Primitive', $loc);
    if (defined($2)) {
      return BigInt($1)
    }
    else {
      return parseInt($0, 10)
    }
  })($$r.loc, $$value, $$value[0], $$value[1]);
  ($$r as any).value = $$m;
  
  return $$r as unknown as MaybeResult<Exclude<typeof $$m, typeof SKIP>>;
}

function Primitive$2($$ctx: ParserContext, $$state: ParseState) {
  const $$r = Primitive$2$parser($$ctx, $$state);
  if (!$$r) {
    
    return undefined;
  }
  const $$m = (function($loc: Loc, $0: any) {
    void $loc, $0;
    pm.match('Primitive', $loc);
    return parseFloat($0)
  })($$r.loc, ($$r.value as any[])[0]);
  ($$r as any).value = $$m;
  
  return $$r as unknown as MaybeResult<Exclude<typeof $$m, typeof SKIP>>;
}

function Primitive$3($$ctx: ParserContext, $$state: ParseState) {
  const $$r = Primitive$3$parser($$ctx, $$state);
  if (!$$r) {
    
    return undefined;
  }
  const $$m = (function($loc: Loc, $0: any) {
    void $loc, $0;
    pm.match('Primitive', $loc);
    return $0
  })($$r.loc, ($$r.value as any[])[0]);
  ($$r as any).value = $$m;
  
  return $$r as unknown as MaybeResult<Exclude<typeof $$m, typeof SKIP>>;
}

function Primitive($$ctx: ParserContext, $$state: ParseState) {
  const $$entered = $$ctx.enter?.("Primitive", $$state);
  if ($$entered && "cache" in $$entered) return $$entered.cache as never;
  const $$eventData = $$entered?.data;
  const $$final: MaybeResult<Unwrap<ReturnType<typeof Primitive$0>> | Unwrap<ReturnType<typeof Primitive$1>> | Unwrap<ReturnType<typeof Primitive$2>> | Unwrap<ReturnType<typeof Primitive$3>>> = Primitive$0($$ctx, $$state)
    || Primitive$1($$ctx, $$state)
    || Primitive$2($$ctx, $$state)
    || Primitive$3($$ctx, $$state);
  $$ctx.exit?.("Primitive", $$state, $$final, $$eventData);

  return $$final;
}

const Array$parser = $P(ArrayItem);

function Array($$ctx: ParserContext, $$state: ParseState) {
  const $$entered = $$ctx.enter?.("Array", $$state);
  if ($$entered && "cache" in $$entered) return $$entered.cache as never;
  const $$eventData = $$entered?.data;
  const $$r = Array$parser($$ctx, $$state);
  if (!$$r) {
    $$ctx.exit?.("Array", $$state, undefined, $$eventData);
    return undefined;
  }
  const $$m = (function($loc: Loc, $1: typeof $$r.value) {
    void $loc, $1;
    pm.match('Array', $loc);
    return $1
  })($$r.loc, $$r.value);
  ($$r as any).value = $$m;
  $$ctx.exit?.("Array", $$state, $$r, $$eventData);
  return $$r as unknown as MaybeResult<Exclude<typeof $$m, typeof SKIP>>;
}

const ArrayItem$0$parser = $S($EXPECT($L3, "ArrayItem \"- \""), Value, NL);

const ArrayItem$1$parser = $S($EXPECT($L4, "ArrayItem \"-\""), NL, INDENT, Value, UNDENT);

function ArrayItem$0($$ctx: ParserContext, $$state: ParseState) {
  const $$r = ArrayItem$0$parser($$ctx, $$state);
  if (!$$r) {
    
    return undefined;
  }
  const $$m = (function($loc: Loc, $2: typeof $$r.value[1]) {
    void $loc, $2;
    pm.match('ArrayItem', $loc);
    return $2
  })($$r.loc, $$r.value[1]);
  ($$r as any).value = $$m;
  
  return $$r as unknown as MaybeResult<Exclude<typeof $$m, typeof SKIP>>;
}

function ArrayItem$1($$ctx: ParserContext, $$state: ParseState) {
  const $$r = ArrayItem$1$parser($$ctx, $$state);
  if (!$$r) {
    
    return undefined;
  }
  const $$m = (function($loc: Loc, $4: typeof $$r.value[3]) {
    void $loc, $4;
    pm.match('ArrayItem', $loc);
    return $4
  })($$r.loc, $$r.value[3]);
  ($$r as any).value = $$m;
  
  return $$r as unknown as MaybeResult<Exclude<typeof $$m, typeof SKIP>>;
}

function ArrayItem($$ctx: ParserContext, $$state: ParseState) {
  const $$entered = $$ctx.enter?.("ArrayItem", $$state);
  if ($$entered && "cache" in $$entered) return $$entered.cache as never;
  const $$eventData = $$entered?.data;
  const $$final: MaybeResult<Unwrap<ReturnType<typeof ArrayItem$0>> | Unwrap<ReturnType<typeof ArrayItem$1>>> = ArrayItem$0($$ctx, $$state)
    || ArrayItem$1($$ctx, $$state);
  $$ctx.exit?.("ArrayItem", $$state, $$final, $$eventData);

  return $$final;
}

const Hash$parser = $P(HashItem);

function Hash($$ctx: ParserContext, $$state: ParseState) {
  const $$entered = $$ctx.enter?.("Hash", $$state);
  if ($$entered && "cache" in $$entered) return $$entered.cache as never;
  const $$eventData = $$entered?.data;
  const $$r = Hash$parser($$ctx, $$state);
  if (!$$r) {
    $$ctx.exit?.("Hash", $$state, undefined, $$eventData);
    return undefined;
  }
  const $$m = (function($loc: Loc, $1: typeof $$r.value) {
    void $loc, $1;
    pm.match('Hash', $loc);
    const hash = {}
    for (const [key, val] of $1) {
      hash[key] = val
    }
    return hash
  })($$r.loc, $$r.value);
  ($$r as any).value = $$m;
  $$ctx.exit?.("Hash", $$state, $$r, $$eventData);
  return $$r as unknown as MaybeResult<Exclude<typeof $$m, typeof SKIP>>;
}

const HashItem$0$parser = $S(Key, $EXPECT($L5, "HashItem \": \""), Value);

const HashItem$1$parser = $S(Key, $EXPECT($L6, "HashItem \":\""), NL, INDENT, Value, UNDENT);

function HashItem$0($$ctx: ParserContext, $$state: ParseState) {
  const $$r = HashItem$0$parser($$ctx, $$state);
  if (!$$r) {
    
    return undefined;
  }
  const $$value = $$r.value;
  const $$m = (function($loc: Loc, $1: typeof $$value[0], $3: typeof $$value[2]) {
    void $loc, $1, $3;
    pm.match('HashItem', $loc);
    return [$1, $3]
  })($$r.loc, $$value[0], $$value[2]);
  ($$r as any).value = $$m;
  
  return $$r as unknown as MaybeResult<Exclude<typeof $$m, typeof SKIP>>;
}

function HashItem$1($$ctx: ParserContext, $$state: ParseState) {
  const $$r = HashItem$1$parser($$ctx, $$state);
  if (!$$r) {
    
    return undefined;
  }
  const $$value = $$r.value;
  const $$m = (function($loc: Loc, $1: typeof $$value[0], $5: typeof $$value[4]) {
    void $loc, $1, $5;
    pm.match('HashItem', $loc);
    return [$1, $5]
  })($$r.loc, $$value[0], $$value[4]);
  ($$r as any).value = $$m;
  
  return $$r as unknown as MaybeResult<Exclude<typeof $$m, typeof SKIP>>;
}

function HashItem($$ctx: ParserContext, $$state: ParseState) {
  const $$entered = $$ctx.enter?.("HashItem", $$state);
  if ($$entered && "cache" in $$entered) return $$entered.cache as never;
  const $$eventData = $$entered?.data;
  const $$final: MaybeResult<Unwrap<ReturnType<typeof HashItem$0>> | Unwrap<ReturnType<typeof HashItem$1>>> = HashItem$0($$ctx, $$state)
    || HashItem$1($$ctx, $$state);
  $$ctx.exit?.("HashItem", $$state, $$final, $$eventData);

  return $$final;
}

const Key$parser = $EXPECT($R3, "Key /[A-Za-z]+/");

function Key($$ctx: ParserContext, $$state: ParseState) {
  const $$entered = $$ctx.enter?.("Key", $$state);
  if ($$entered && "cache" in $$entered) return $$entered.cache as never;
  const $$eventData = $$entered?.data;
  const $$r = Key$parser($$ctx, $$state);
  if (!$$r) {
    $$ctx.exit?.("Key", $$state, undefined, $$eventData);
    return undefined;
  }
  const $$m = (function($loc: Loc, $0: any) {
    void $loc, $0;
    pm.match('Key', $loc);
    return $0
  })($$r.loc, ($$r.value as any[])[0]);
  ($$r as any).value = $$m;
  $$ctx.exit?.("Key", $$state, $$r, $$eventData);
  return $$r as unknown as MaybeResult<Exclude<typeof $$m, typeof SKIP>>;
}

const Special$0$parser = $EXPECT($L7, "Special \"undef\"");

const Special$1$parser = $EXPECT($L8, "Special \"null\"");

const Special$2$parser = $EXPECT($L9, "Special \"true\"");

const Special$3$parser = $EXPECT($L10, "Special \"false\"");

const Special$4$parser = $EXPECT($L11, "Special \"emptyArray\"");

const Special$5$parser = $EXPECT($L12, "Special \"emptyHash\"");

const Special$6$parser = $EXPECT($L13, "Special \"emptySet\"");

const Special$7$parser = $EXPECT($L14, "Special \"emptyMap\"");

const Special$8$parser = $EXPECT($L15, "Special \"NaN\"");

const Special$9$parser = $EXPECT($L16, "Special \"inf\"");

const Special$10$parser = $EXPECT($L17, "Special \"neginf\"");

const Special$11$parser = $S($EXPECT($L18, "Special \"symbol\""), $EXPECT($R4, "Special /[^｠]*/"));

function Special$0($$ctx: ParserContext, $$state: ParseState) {
  const $$r = Special$0$parser($$ctx, $$state);
  if (!$$r) {
    
    return undefined;
  }
  const $$m = (function($loc: Loc) {
    void $loc;
    pm.match('Special', $loc);
    return undef
  })($$r.loc);
  ($$r as any).value = $$m;
  
  return $$r as unknown as MaybeResult<Exclude<typeof $$m, typeof SKIP>>;
}

function Special$1($$ctx: ParserContext, $$state: ParseState) {
  const $$r = Special$1$parser($$ctx, $$state);
  if (!$$r) {
    
    return undefined;
  }
  const $$m = (function($loc: Loc) {
    void $loc;
    pm.match('Special', $loc);
    return null
  })($$r.loc);
  ($$r as any).value = $$m;
  
  return $$r as unknown as MaybeResult<Exclude<typeof $$m, typeof SKIP>>;
}

function Special$2($$ctx: ParserContext, $$state: ParseState) {
  const $$r = Special$2$parser($$ctx, $$state);
  if (!$$r) {
    
    return undefined;
  }
  const $$m = (function($loc: Loc) {
    void $loc;
    pm.match('Special', $loc);
    return true
  })($$r.loc);
  ($$r as any).value = $$m;
  
  return $$r as unknown as MaybeResult<Exclude<typeof $$m, typeof SKIP>>;
}

function Special$3($$ctx: ParserContext, $$state: ParseState) {
  const $$r = Special$3$parser($$ctx, $$state);
  if (!$$r) {
    
    return undefined;
  }
  const $$m = (function($loc: Loc) {
    void $loc;
    pm.match('Special', $loc);
    return false
  })($$r.loc);
  ($$r as any).value = $$m;
  
  return $$r as unknown as MaybeResult<Exclude<typeof $$m, typeof SKIP>>;
}

function Special$4($$ctx: ParserContext, $$state: ParseState) {
  const $$r = Special$4$parser($$ctx, $$state);
  if (!$$r) {
    
    return undefined;
  }
  const $$m = (function($loc: Loc) {
    void $loc;
    pm.match('Special', $loc);
    return []
  })($$r.loc);
  ($$r as any).value = $$m;
  
  return $$r as unknown as MaybeResult<Exclude<typeof $$m, typeof SKIP>>;
}

function Special$5($$ctx: ParserContext, $$state: ParseState) {
  const $$r = Special$5$parser($$ctx, $$state);
  if (!$$r) {
    
    return undefined;
  }
  const $$m = (function($loc: Loc) {
    void $loc;
    pm.match('Special', $loc);
    return {}
  })($$r.loc);
  ($$r as any).value = $$m;
  
  return $$r as unknown as MaybeResult<Exclude<typeof $$m, typeof SKIP>>;
}

function Special$6($$ctx: ParserContext, $$state: ParseState) {
  const $$r = Special$6$parser($$ctx, $$state);
  if (!$$r) {
    
    return undefined;
  }
  const $$m = (function($loc: Loc) {
    void $loc;
    pm.match('Special', $loc);
    return new Set()
  })($$r.loc);
  ($$r as any).value = $$m;
  
  return $$r as unknown as MaybeResult<Exclude<typeof $$m, typeof SKIP>>;
}

function Special$7($$ctx: ParserContext, $$state: ParseState) {
  const $$r = Special$7$parser($$ctx, $$state);
  if (!$$r) {
    
    return undefined;
  }
  const $$m = (function($loc: Loc) {
    void $loc;
    pm.match('Special', $loc);
    return new Map()
  })($$r.loc);
  ($$r as any).value = $$m;
  
  return $$r as unknown as MaybeResult<Exclude<typeof $$m, typeof SKIP>>;
}

function Special$8($$ctx: ParserContext, $$state: ParseState) {
  const $$r = Special$8$parser($$ctx, $$state);
  if (!$$r) {
    
    return undefined;
  }
  const $$m = (function($loc: Loc) {
    void $loc;
    pm.match('Special', $loc);
    return Number.NaN
  })($$r.loc);
  ($$r as any).value = $$m;
  
  return $$r as unknown as MaybeResult<Exclude<typeof $$m, typeof SKIP>>;
}

function Special$9($$ctx: ParserContext, $$state: ParseState) {
  const $$r = Special$9$parser($$ctx, $$state);
  if (!$$r) {
    
    return undefined;
  }
  const $$m = (function($loc: Loc) {
    void $loc;
    pm.match('Special', $loc);
    return Infinity
  })($$r.loc);
  ($$r as any).value = $$m;
  
  return $$r as unknown as MaybeResult<Exclude<typeof $$m, typeof SKIP>>;
}

function Special$10($$ctx: ParserContext, $$state: ParseState) {
  const $$r = Special$10$parser($$ctx, $$state);
  if (!$$r) {
    
    return undefined;
  }
  const $$m = (function($loc: Loc) {
    void $loc;
    pm.match('Special', $loc);
    return -Infinity
  })($$r.loc);
  ($$r as any).value = $$m;
  
  return $$r as unknown as MaybeResult<Exclude<typeof $$m, typeof SKIP>>;
}

function Special$11($$ctx: ParserContext, $$state: ParseState) {
  const $$r = Special$11$parser($$ctx, $$state);
  if (!$$r) {
    
    return undefined;
  }
  const $$m = (function($loc: Loc, $2: typeof $$r.value[1]) {
    void $loc, $2;
    pm.match('Special', $loc);
    return Symbol($2)
  })($$r.loc, $$r.value[1]);
  ($$r as any).value = $$m;
  
  return $$r as unknown as MaybeResult<Exclude<typeof $$m, typeof SKIP>>;
}

function Special($$ctx: ParserContext, $$state: ParseState) {
  const $$entered = $$ctx.enter?.("Special", $$state);
  if ($$entered && "cache" in $$entered) return $$entered.cache as never;
  const $$eventData = $$entered?.data;
  const $$final: MaybeResult<Unwrap<ReturnType<typeof Special$0>> | Unwrap<ReturnType<typeof Special$1>> | Unwrap<ReturnType<typeof Special$2>> | Unwrap<ReturnType<typeof Special$3>> | Unwrap<ReturnType<typeof Special$4>> | Unwrap<ReturnType<typeof Special$5>> | Unwrap<ReturnType<typeof Special$6>> | Unwrap<ReturnType<typeof Special$7>> | Unwrap<ReturnType<typeof Special$8>> | Unwrap<ReturnType<typeof Special$9>> | Unwrap<ReturnType<typeof Special$10>> | Unwrap<ReturnType<typeof Special$11>>> = Special$0($$ctx, $$state)
    || Special$1($$ctx, $$state)
    || Special$2($$ctx, $$state)
    || Special$3($$ctx, $$state)
    || Special$4($$ctx, $$state)
    || Special$5($$ctx, $$state)
    || Special$6($$ctx, $$state)
    || Special$7($$ctx, $$state)
    || Special$8($$ctx, $$state)
    || Special$9($$ctx, $$state)
    || Special$10($$ctx, $$state)
    || Special$11($$ctx, $$state);
  $$ctx.exit?.("Special", $$state, $$final, $$eventData);

  return $$final;
}

const INDENT$parser = $R$0($EXPECT($R5, "INDENT /\\x0F/"));

function INDENT($$ctx: ParserContext, $$state: ParseState) {
  const $$entered = $$ctx.enter?.("INDENT", $$state);
  if ($$entered && "cache" in $$entered) return $$entered.cache as never;
  const $$eventData = $$entered?.data;
  const $$final = INDENT$parser($$ctx, $$state);
  $$ctx.exit?.("INDENT", $$state, $$final, $$eventData);

  return $$final;
}

const UNDENT$parser = $R$0($EXPECT($R6, "UNDENT /\\x0E/"));

function UNDENT($$ctx: ParserContext, $$state: ParseState) {
  const $$entered = $$ctx.enter?.("UNDENT", $$state);
  if ($$entered && "cache" in $$entered) return $$entered.cache as never;
  const $$eventData = $$entered?.data;
  const $$final = UNDENT$parser($$ctx, $$state);
  $$ctx.exit?.("UNDENT", $$state, $$final, $$eventData);

  return $$final;
}

const NL$parser = $R$0($EXPECT($R7, "NL /\\r?\\n/"));

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
  Value,
  Primitive,
  Array,
  ArrayItem,
  Hash,
  HashItem,
  Key,
  Special,
  INDENT,
  UNDENT,
  NL
}


import {CParseMatches} from 'parse-utils';
export let pm = new CParseMatches();

// nice.parse.hera

import {undef, defined, assert} from 'base'

export const beginParse = (text: string): void => {
  pm.reset(text);

  }
