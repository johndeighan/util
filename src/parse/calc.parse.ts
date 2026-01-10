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
    Expression: Expression,
Term: Term,
Factor: Factor,
Integer: Integer,
_: _
  };


const grammarDefaultRule = "Expression";

const $L0 = $L("+");
const $L1 = $L("-");
const $L2 = $L("*");
const $L3 = $L("/");
const $L4 = $L("(");
const $L5 = $L(")");


const $R0 = $R(new RegExp("[0-9]+", 'suy'));
const $R1 = $R(new RegExp("\\s*", 'suy'));


//@ts-ignore
const Expression$0 = $TS($S(Term, $Q($S(_, $C($EXPECT($L0, "Expression \"+\""), $EXPECT($L1, "Expression \"-\"")), _, Term))), function($skip, $loc, $0, $1, $2) {

return $2.reduce(function(result, element) {
  switch (element[1]) {
    case "+": return result + element[3];
    case "-": return result - element[3];
  }
}, $1);
});
//@ts-ignore
function Expression(ctx, state) { return $EVENT(ctx, state, "Expression", Expression$0) }

//@ts-ignore
const Term$0 = $TS($S(Factor, $Q($S(_, $C($EXPECT($L2, "Term \"*\""), $EXPECT($L3, "Term \"/\"")), _, Factor))), function($skip, $loc, $0, $1, $2) {

return $2.reduce(function(result, element) {
  switch (element[1]) {
    case "*": return result * element[3];
    case "/": return result / element[3];
  }
}, $1)
});
//@ts-ignore
function Term(ctx, state) { return $EVENT(ctx, state, "Term", Term$0) }

//@ts-ignore
const Factor$0 = $T($S($EXPECT($L4, "Factor \"(\""), _, Expression, _, $EXPECT($L5, "Factor \")\"")), function(value) {return value[2] });
//@ts-ignore
const Factor$1 = Integer
//@ts-ignore
const Factor$$ = [Factor$0,Factor$1]
//@ts-ignore
function Factor(ctx, state) { return $EVENT_C(ctx, state, "Factor", Factor$$) }

//@ts-ignore
const Integer$0 = $TS($S(_, $EXPECT($R0, "Integer /[0-9]+/")), function($skip, $loc, $0, $1, $2) {

return Number($2)
});
//@ts-ignore
function Integer(ctx, state) { return $EVENT(ctx, state, "Integer", Integer$0) }

//@ts-ignore
const _$0 = $R$0($EXPECT($R1, "_ /\\s*/"))
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
  Expression,
  Term,
  Factor,
  Integer,
  _
}

