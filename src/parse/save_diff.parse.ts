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
    Program: Program,
A: A,
B: B
  };


const grammarDefaultRule = "Program";

const $L0 = $L("a");
const $L1 = $L("b");




//@ts-ignore
const Program$0 = $TS($S(A, B), function($skip, $loc, $0, $1, $2) {
var a = $1;var b = $2;
return a.length - b.length
});
//@ts-ignore
function Program(ctx, state) { return $EVENT(ctx, state, "Program", Program$0) }

//@ts-ignore
const A$0 = $Q($EXPECT($L0, "A \"a\""))
//@ts-ignore
function A(ctx, state) { return $EVENT(ctx, state, "A", A$0) }

//@ts-ignore
const B$0 = $Q($EXPECT($L1, "B \"b\""))
//@ts-ignore
function B(ctx, state) { return $EVENT(ctx, state, "B", B$0) }



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
  Program,
  A,
  B
}


//@ts-nocheck
