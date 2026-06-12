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
  RetVal,
  Value,
  LItem,
  HItem,
  Key,
  Primitive,
  Spec,
  _,
  WS,
  INDENT,
  UNDENT,
  NL};



const grammarDefaultRule = "RetVal";

const $skip: (typeof SKIP) = SKIP; void $skip;

const $L0 = $L("-");
const $L1 = $L(":");
const $L2 = $L("｟");
const $L3 = $L("｠");
const $L4 = $L("undef");
const $L5 = $L("null");
const $L6 = $L("true");
const $L7 = $L("false");
const $L8 = $L("NaN");
const $L9 = $L("inf");
const $L10 = $L("neginf");
const $L11 = $L("symbol");


const $R0 = $R(new RegExp("[A-Za-z]+", 'suy'));
const $R1 = $R(new RegExp("“([^\\n\\x0F\\x0E]+)", 'suy'));
const $R2 = $R(new RegExp("(\\d+)n", 'suy'));
const $R3 = $R(new RegExp("\\d+(\\.\\d+)?", 'suy'));
const $R4 = $R(new RegExp("[^\\n\\x0F\\x0E\\[\\{]+", 'suy'));
const $R5 = $R(new RegExp("[^\\n\\x0F\\x0E]+", 'suy'));
const $R6 = $R(new RegExp("[^｠]*", 'suy'));
const $R7 = $R(new RegExp("[\\x20\\t]*", 'suy'));
const $R8 = $R(new RegExp("\\x20+", 'suy'));
const $R9 = $R(new RegExp("\\x0F", 'suy'));
const $R10 = $R(new RegExp("\\x0E", 'suy'));
const $R11 = $R(new RegExp("\\r?\\n", 'suy'));


const RetVal$parser = $S(Value, $Q(NL));

function RetVal($$ctx: ParserContext, $$state: ParseState) {
  const $$entered = $$ctx.enter?.("RetVal", $$state);
  if ($$entered && "cache" in $$entered) return $$entered.cache as never;
  const $$eventData = $$entered?.data;
  const $$r = RetVal$parser($$ctx, $$state);
  if (!$$r) {
    $$ctx.exit?.("RetVal", $$state, undefined, $$eventData);
    return undefined;
  }
  const $$m = (function($loc: Loc, $1: typeof $$r.value[0]) {
    void $loc, $1;
    pm.match('RetVal', $loc);
    return pm.returnVal($1);
  })($$r.loc, $$r.value[0]);
  ($$r as any).value = $$m;
  $$ctx.exit?.("RetVal", $$state, $$r, $$eventData);
  return $$r as unknown as MaybeResult<Exclude<typeof $$m, typeof SKIP>>;
}

const Value$0$parser = $P(LItem);

const Value$1$parser = $P(HItem);

const Value$2$parser = $S(Primitive);

function Value$0($$ctx: ParserContext, $$state: ParseState) {
  const $$r = Value$0$parser($$ctx, $$state);
  if (!$$r) {
    
    return undefined;
  }
  const $$m = (function($loc: Loc, $1: typeof $$r.value) {
    void $loc, $1;
    pm.match('Value', $loc);
    return pm.returnVal($1);
  })($$r.loc, $$r.value);
  ($$r as any).value = $$m;
  
  return $$r as unknown as MaybeResult<Exclude<typeof $$m, typeof SKIP>>;
}

function Value$1($$ctx: ParserContext, $$state: ParseState) {
  const $$r = Value$1$parser($$ctx, $$state);
  if (!$$r) {
    
    return undefined;
  }
  const $$m = (function($loc: Loc, $1: typeof $$r.value) {
    void $loc, $1;
    pm.match('Value', $loc);
    const h: hash = {}
    for (const [key, val] of $1) {
      h[key] = val
    }
    return pm.returnVal(h);
  })($$r.loc, $$r.value);
  ($$r as any).value = $$m;
  
  return $$r as unknown as MaybeResult<Exclude<typeof $$m, typeof SKIP>>;
}

function Value$2($$ctx: ParserContext, $$state: ParseState) {
  const $$r = Value$2$parser($$ctx, $$state);
  if (!$$r) {
    
    return undefined;
  }
  const $$m = (function($loc: Loc, $1: typeof $$r.value[0]) {
    void $loc, $1;
    pm.match('Value', $loc);
    return pm.returnVal($1);
  })($$r.loc, $$r.value[0]);
  ($$r as any).value = $$m;
  
  return $$r as unknown as MaybeResult<Exclude<typeof $$m, typeof SKIP>>;
}

function Value($$ctx: ParserContext, $$state: ParseState) {
  const $$entered = $$ctx.enter?.("Value", $$state);
  if ($$entered && "cache" in $$entered) return $$entered.cache as never;
  const $$eventData = $$entered?.data;
  const $$final: MaybeResult<Unwrap<ReturnType<typeof Value$0>> | Unwrap<ReturnType<typeof Value$1>> | Unwrap<ReturnType<typeof Value$2>>> = Value$0($$ctx, $$state)
    || Value$1($$ctx, $$state)
    || Value$2($$ctx, $$state);
  $$ctx.exit?.("Value", $$state, $$final, $$eventData);

  return $$final;
}

const LItem$0$parser = $S($EXPECT($L0, "LItem \"-\""), WS, Primitive, NL);

const LItem$1$parser = $S($EXPECT($L0, "LItem \"-\""), _, NL, INDENT, $P(LItem), UNDENT);

function LItem$0($$ctx: ParserContext, $$state: ParseState) {
  const $$r = LItem$0$parser($$ctx, $$state);
  if (!$$r) {
    
    return undefined;
  }
  const $$m = (function($loc: Loc, $3: typeof $$r.value[2]) {
    void $loc, $3;
    pm.match('LItem', $loc);
    return pm.returnVal($3);
  })($$r.loc, $$r.value[2]);
  ($$r as any).value = $$m;
  
  return $$r as unknown as MaybeResult<Exclude<typeof $$m, typeof SKIP>>;
}

function LItem$1($$ctx: ParserContext, $$state: ParseState) {
  const $$r = LItem$1$parser($$ctx, $$state);
  if (!$$r) {
    
    return undefined;
  }
  const $$m = (function($loc: Loc, $5: typeof $$r.value[4]) {
    void $loc, $5;
    pm.match('LItem', $loc);
    return pm.returnVal($5);
  })($$r.loc, $$r.value[4]);
  ($$r as any).value = $$m;
  
  return $$r as unknown as MaybeResult<Exclude<typeof $$m, typeof SKIP>>;
}

function LItem($$ctx: ParserContext, $$state: ParseState) {
  const $$entered = $$ctx.enter?.("LItem", $$state);
  if ($$entered && "cache" in $$entered) return $$entered.cache as never;
  const $$eventData = $$entered?.data;
  const $$final: MaybeResult<Unwrap<ReturnType<typeof LItem$0>> | Unwrap<ReturnType<typeof LItem$1>>> = LItem$0($$ctx, $$state)
    || LItem$1($$ctx, $$state);
  $$ctx.exit?.("LItem", $$state, $$final, $$eventData);

  return $$final;
}

const HItem$0$parser = $S(Key, WS, Primitive, NL);

const HItem$1$parser = $S(Key, _, NL, INDENT, $P(HItem), UNDENT);

function HItem$0($$ctx: ParserContext, $$state: ParseState) {
  const $$r = HItem$0$parser($$ctx, $$state);
  if (!$$r) {
    
    return undefined;
  }
  const $$value = $$r.value;
  const $$m = (function($loc: Loc, $1: typeof $$value[0], $3: typeof $$value[2]) {
    void $loc, $1, $3;
    pm.match('HItem', $loc);
    return pm.returnVal([$1, $3]);
  })($$r.loc, $$value[0], $$value[2]);
  ($$r as any).value = $$m;
  
  return $$r as unknown as MaybeResult<Exclude<typeof $$m, typeof SKIP>>;
}

function HItem$1($$ctx: ParserContext, $$state: ParseState) {
  const $$r = HItem$1$parser($$ctx, $$state);
  if (!$$r) {
    
    return undefined;
  }
  const $$m = (function($loc: Loc, $5: typeof $$r.value[4]) {
    void $loc, $5;
    pm.match('HItem', $loc);
    return pm.returnVal($5);
  })($$r.loc, $$r.value[4]);
  ($$r as any).value = $$m;
  
  return $$r as unknown as MaybeResult<Exclude<typeof $$m, typeof SKIP>>;
}

function HItem($$ctx: ParserContext, $$state: ParseState) {
  const $$entered = $$ctx.enter?.("HItem", $$state);
  if ($$entered && "cache" in $$entered) return $$entered.cache as never;
  const $$eventData = $$entered?.data;
  const $$final: MaybeResult<Unwrap<ReturnType<typeof HItem$0>> | Unwrap<ReturnType<typeof HItem$1>>> = HItem$0($$ctx, $$state)
    || HItem$1($$ctx, $$state);
  $$ctx.exit?.("HItem", $$state, $$final, $$eventData);

  return $$final;
}

const Key$parser = $S($EXPECT($R0, "Key /[A-Za-z]+/"), $EXPECT($L1, "Key \":\""));

function Key($$ctx: ParserContext, $$state: ParseState) {
  const $$entered = $$ctx.enter?.("Key", $$state);
  if ($$entered && "cache" in $$entered) return $$entered.cache as never;
  const $$eventData = $$entered?.data;
  const $$r = Key$parser($$ctx, $$state);
  if (!$$r) {
    $$ctx.exit?.("Key", $$state, undefined, $$eventData);
    return undefined;
  }
  const $$m = (function($loc: Loc, $1: typeof $$r.value[0]) {
    void $loc, $1;
    pm.match('Key', $loc);
    return pm.returnVal($1[0]);
  })($$r.loc, $$r.value[0]);
  ($$r as any).value = $$m;
  $$ctx.exit?.("Key", $$state, $$r, $$eventData);
  return $$r as unknown as MaybeResult<Exclude<typeof $$m, typeof SKIP>>;
}

const Primitive$0$parser = $S($EXPECT($L2, "Primitive \"｟\""), Spec, $EXPECT($L3, "Primitive \"｠\""));

const Primitive$1$parser = $EXPECT($R1, "Primitive /“([^\\n\\x0F\\x0E]+)/");

const Primitive$2$parser = $EXPECT($R2, "Primitive /(\\d+)n/");

const Primitive$3$parser = $EXPECT($R3, "Primitive /\\d+(\\.\\d+)?/");

const Primitive$4$parser = $EXPECT($R4, "Primitive /[^\\n\\x0F\\x0E\\[\\{]+/");

const Primitive$5$parser = $EXPECT($R5, "Primitive /[^\\n\\x0F\\x0E]+/");

function Primitive$0($$ctx: ParserContext, $$state: ParseState) {
  const $$r = Primitive$0$parser($$ctx, $$state);
  if (!$$r) {
    
    return undefined;
  }
  const $$m = (function($loc: Loc, $2: typeof $$r.value[1]) {
    void $loc, $2;
    pm.match('Primitive', $loc);
    return pm.returnVal($2);
  })($$r.loc, $$r.value[1]);
  ($$r as any).value = $$m;
  
  return $$r as unknown as MaybeResult<Exclude<typeof $$m, typeof SKIP>>;
}

function Primitive$1($$ctx: ParserContext, $$state: ParseState) {
  const $$r = Primitive$1$parser($$ctx, $$state);
  if (!$$r) {
    
    return undefined;
  }
  const $$m = (function($loc: Loc, $1: any) {
    void $loc, $1;
    pm.match('Primitive', $loc);
    return pm.returnVal($1);
  })($$r.loc, ($$r.value as any[])[1]);
  ($$r as any).value = $$m;
  
  return $$r as unknown as MaybeResult<Exclude<typeof $$m, typeof SKIP>>;
}

function Primitive$2($$ctx: ParserContext, $$state: ParseState) {
  const $$r = Primitive$2$parser($$ctx, $$state);
  if (!$$r) {
    
    return undefined;
  }
  const $$m = (function($loc: Loc, $1: any) {
    void $loc, $1;
    pm.match('Primitive', $loc);
    return pm.returnVal(BigInt($1));
  })($$r.loc, ($$r.value as any[])[1]);
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
    return pm.returnVal(JSON.parse($0));
  })($$r.loc, ($$r.value as any[])[0]);
  ($$r as any).value = $$m;
  
  return $$r as unknown as MaybeResult<Exclude<typeof $$m, typeof SKIP>>;
}

function Primitive$4($$ctx: ParserContext, $$state: ParseState) {
  const $$r = Primitive$4$parser($$ctx, $$state);
  if (!$$r) {
    
    return undefined;
  }
  const $$m = (function($loc: Loc, $0: any) {
    void $loc, $0;
    pm.match('Primitive', $loc);
    return pm.returnVal($0);
  })($$r.loc, ($$r.value as any[])[0]);
  ($$r as any).value = $$m;
  
  return $$r as unknown as MaybeResult<Exclude<typeof $$m, typeof SKIP>>;
}

function Primitive$5($$ctx: ParserContext, $$state: ParseState) {
  const $$r = Primitive$5$parser($$ctx, $$state);
  if (!$$r) {
    
    return undefined;
  }
  const $$m = (function($loc: Loc, $0: any) {
    void $loc, $0;
    pm.match('Primitive', $loc);
    return pm.returnVal(JSON.parse($0));
  })($$r.loc, ($$r.value as any[])[0]);
  ($$r as any).value = $$m;
  
  return $$r as unknown as MaybeResult<Exclude<typeof $$m, typeof SKIP>>;
}

function Primitive($$ctx: ParserContext, $$state: ParseState) {
  const $$entered = $$ctx.enter?.("Primitive", $$state);
  if ($$entered && "cache" in $$entered) return $$entered.cache as never;
  const $$eventData = $$entered?.data;
  const $$final: MaybeResult<Unwrap<ReturnType<typeof Primitive$0>> | Unwrap<ReturnType<typeof Primitive$1>> | Unwrap<ReturnType<typeof Primitive$2>> | Unwrap<ReturnType<typeof Primitive$3>> | Unwrap<ReturnType<typeof Primitive$4>> | Unwrap<ReturnType<typeof Primitive$5>>> = Primitive$0($$ctx, $$state)
    || Primitive$1($$ctx, $$state)
    || Primitive$2($$ctx, $$state)
    || Primitive$3($$ctx, $$state)
    || Primitive$4($$ctx, $$state)
    || Primitive$5($$ctx, $$state);
  $$ctx.exit?.("Primitive", $$state, $$final, $$eventData);

  return $$final;
}

const Spec$0$parser = $EXPECT($L4, "Spec \"undef\"");

const Spec$1$parser = $EXPECT($L5, "Spec \"null\"");

const Spec$2$parser = $EXPECT($L6, "Spec \"true\"");

const Spec$3$parser = $EXPECT($L7, "Spec \"false\"");

const Spec$4$parser = $EXPECT($L8, "Spec \"NaN\"");

const Spec$5$parser = $EXPECT($L9, "Spec \"inf\"");

const Spec$6$parser = $EXPECT($L10, "Spec \"neginf\"");

const Spec$7$parser = $S($EXPECT($L11, "Spec \"symbol\""), $EXPECT($R6, "Spec /[^｠]*/"));

function Spec$0($$ctx: ParserContext, $$state: ParseState) {
  const $$r = Spec$0$parser($$ctx, $$state);
  if (!$$r) {
    
    return undefined;
  }
  const $$m = (function($loc: Loc) {
    void $loc;
    pm.match('Spec', $loc);
    return pm.returnVal(undef);
  })($$r.loc);
  ($$r as any).value = $$m;
  
  return $$r as unknown as MaybeResult<Exclude<typeof $$m, typeof SKIP>>;
}

function Spec$1($$ctx: ParserContext, $$state: ParseState) {
  const $$r = Spec$1$parser($$ctx, $$state);
  if (!$$r) {
    
    return undefined;
  }
  const $$m = (function($loc: Loc) {
    void $loc;
    pm.match('Spec', $loc);
    return pm.returnVal(null);
  })($$r.loc);
  ($$r as any).value = $$m;
  
  return $$r as unknown as MaybeResult<Exclude<typeof $$m, typeof SKIP>>;
}

function Spec$2($$ctx: ParserContext, $$state: ParseState) {
  const $$r = Spec$2$parser($$ctx, $$state);
  if (!$$r) {
    
    return undefined;
  }
  const $$m = (function($loc: Loc) {
    void $loc;
    pm.match('Spec', $loc);
    return pm.returnVal(true);
  })($$r.loc);
  ($$r as any).value = $$m;
  
  return $$r as unknown as MaybeResult<Exclude<typeof $$m, typeof SKIP>>;
}

function Spec$3($$ctx: ParserContext, $$state: ParseState) {
  const $$r = Spec$3$parser($$ctx, $$state);
  if (!$$r) {
    
    return undefined;
  }
  const $$m = (function($loc: Loc) {
    void $loc;
    pm.match('Spec', $loc);
    return pm.returnVal(false);
  })($$r.loc);
  ($$r as any).value = $$m;
  
  return $$r as unknown as MaybeResult<Exclude<typeof $$m, typeof SKIP>>;
}

function Spec$4($$ctx: ParserContext, $$state: ParseState) {
  const $$r = Spec$4$parser($$ctx, $$state);
  if (!$$r) {
    
    return undefined;
  }
  const $$m = (function($loc: Loc) {
    void $loc;
    pm.match('Spec', $loc);
    return pm.returnVal(Number.NaN);
  })($$r.loc);
  ($$r as any).value = $$m;
  
  return $$r as unknown as MaybeResult<Exclude<typeof $$m, typeof SKIP>>;
}

function Spec$5($$ctx: ParserContext, $$state: ParseState) {
  const $$r = Spec$5$parser($$ctx, $$state);
  if (!$$r) {
    
    return undefined;
  }
  const $$m = (function($loc: Loc) {
    void $loc;
    pm.match('Spec', $loc);
    return pm.returnVal(Infinity);
  })($$r.loc);
  ($$r as any).value = $$m;
  
  return $$r as unknown as MaybeResult<Exclude<typeof $$m, typeof SKIP>>;
}

function Spec$6($$ctx: ParserContext, $$state: ParseState) {
  const $$r = Spec$6$parser($$ctx, $$state);
  if (!$$r) {
    
    return undefined;
  }
  const $$m = (function($loc: Loc) {
    void $loc;
    pm.match('Spec', $loc);
    return pm.returnVal(-Infinity);
  })($$r.loc);
  ($$r as any).value = $$m;
  
  return $$r as unknown as MaybeResult<Exclude<typeof $$m, typeof SKIP>>;
}

function Spec$7($$ctx: ParserContext, $$state: ParseState) {
  const $$r = Spec$7$parser($$ctx, $$state);
  if (!$$r) {
    
    return undefined;
  }
  const $$m = (function($loc: Loc, $2: typeof $$r.value[1]) {
    void $loc, $2;
    pm.match('Spec', $loc);
    return pm.returnVal(Symbol($2));
  })($$r.loc, $$r.value[1]);
  ($$r as any).value = $$m;
  
  return $$r as unknown as MaybeResult<Exclude<typeof $$m, typeof SKIP>>;
}

function Spec($$ctx: ParserContext, $$state: ParseState) {
  const $$entered = $$ctx.enter?.("Spec", $$state);
  if ($$entered && "cache" in $$entered) return $$entered.cache as never;
  const $$eventData = $$entered?.data;
  const $$final: MaybeResult<Unwrap<ReturnType<typeof Spec$0>> | Unwrap<ReturnType<typeof Spec$1>> | Unwrap<ReturnType<typeof Spec$2>> | Unwrap<ReturnType<typeof Spec$3>> | Unwrap<ReturnType<typeof Spec$4>> | Unwrap<ReturnType<typeof Spec$5>> | Unwrap<ReturnType<typeof Spec$6>> | Unwrap<ReturnType<typeof Spec$7>>> = Spec$0($$ctx, $$state)
    || Spec$1($$ctx, $$state)
    || Spec$2($$ctx, $$state)
    || Spec$3($$ctx, $$state)
    || Spec$4($$ctx, $$state)
    || Spec$5($$ctx, $$state)
    || Spec$6($$ctx, $$state)
    || Spec$7($$ctx, $$state);
  $$ctx.exit?.("Spec", $$state, $$final, $$eventData);

  return $$final;
}

const _$parser = $EXPECT($R7, "_ /[\\x20\\t]*/");

function _($$ctx: ParserContext, $$state: ParseState) {
  const $$entered = $$ctx.enter?.("_", $$state);
  if ($$entered && "cache" in $$entered) return $$entered.cache as never;
  const $$eventData = $$entered?.data;
  const $$r = _$parser($$ctx, $$state);
  if (!$$r) {
    $$ctx.exit?.("_", $$state, undefined, $$eventData);
    return undefined;
  }
  const $$m = (function($loc: Loc) {
    void $loc;
    pm.match('_', $loc);
  })($$r.loc);
  ($$r as any).value = $$m;
  $$ctx.exit?.("_", $$state, $$r, $$eventData);
  return $$r as unknown as MaybeResult<Exclude<typeof $$m, typeof SKIP>>;
}

const WS$parser = $EXPECT($R8, "WS /\\x20+/");

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

const INDENT$parser = $EXPECT($R9, "INDENT /\\x0F/");

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

const UNDENT$parser = $EXPECT($R10, "UNDENT /\\x0E/");

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

const NL$parser = $EXPECT($R11, "NL /\\r?\\n/");

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
  RetVal,
  Value,
  LItem,
  HItem,
  Key,
  Primitive,
  Spec,
  _,
  WS,
  INDENT,
  UNDENT,
  NL
}


import {CParseMatches} from 'parse-utils';
export let pm = new CParseMatches();

import {undef, defined, assert} from 'base'
import {hash} from 'datatypes'
import {str2indents} from 'hera-parse'

export const beginParse = (
    text: string,
    hOptions: {[key: string|symbol]: unknown} = {}
    ): string|undefined => {
  pm.reset(text);
  return str2indents(text)
  }
