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
    Grammar: Grammar,
Line: Line,
Indent: Indent,
Content: Content,
Expression: Expression,
Applied: Applied,
Application: Application,
ArgumentList: ArgumentList,
Operated: Operated,
Assigned: Assigned,
Accessed: Accessed,
Access: Access,
Primary: Primary,
This: This,
Function: Function,
Literal: Literal,
Parameters: Parameters,
Comma: Comma,
Name: Name,
BinaryOp: BinaryOp,
UnaryOp: UnaryOp,
Statement: Statement,
Import: Import,
Export: Export,
Numeric: Numeric,
StringValue: StringValue,
DoubleStringCharacter: DoubleStringCharacter,
SingleStringCharacter: SingleStringCharacter,
EscapeSequence: EscapeSequence,
Space: Space,
__: __,
EOL: EOL
  };


const grammarDefaultRule = "Grammar";

const $L0 = $L("  ");
const $L1 = $L("()");
const $L2 = $L("(");
const $L3 = $L(")");
const $L4 = $L(",");
const $L5 = $L("=");
const $L6 = $L("?");
const $L7 = $L(".");
const $L8 = $L("[");
const $L9 = $L("]");
const $L10 = $L("this");
const $L11 = $L("@");
const $L12 = $L("->");
const $L13 = $L("true");
const $L14 = $L("false");
const $L15 = $L("null");
const $L16 = $L("undefined");
const $L17 = $L("");
const $L18 = $L("+");
const $L19 = $L("-");
const $L20 = $L("*");
const $L21 = $L("/");
const $L22 = $L("and");
const $L23 = $L("&&");
const $L24 = $L("or");
const $L25 = $L("||");
const $L26 = $L("\"");
const $L27 = $L("\'");
const $L28 = $L("\\");


const $R0 = $R(new RegExp("[$a-zA-Z_][$a-zA-Z0-9_]*", 'suy'));
const $R1 = $R(new RegExp("[!~+-]", 'suy'));
const $R2 = $R(new RegExp("import[^\\r\\n]*", 'suy'));
const $R3 = $R(new RegExp("export[^\\r\\n]*", 'suy'));
const $R4 = $R(new RegExp("\\d+(?:\\.\\d*)?", 'suy'));
const $R5 = $R(new RegExp("[^\"\\\\]+", 'suy'));
const $R6 = $R(new RegExp("[^'\\\\]+", 'suy'));
const $R7 = $R(new RegExp(".", 'suy'));
const $R8 = $R(new RegExp("[\\t ]", 'suy'));
const $R9 = $R(new RegExp("\\s*", 'suy'));
const $R10 = $R(new RegExp("\\r\\n|\\n|\\r", 'suy'));


//@ts-ignore
const Grammar$0 = $Q(Line)
//@ts-ignore
function Grammar(ctx, state) { return $EVENT(ctx, state, "Grammar", Grammar$0) }

//@ts-ignore
const Line$0 = $S(Indent, Content, EOL)
//@ts-ignore
const Line$1 = $S(Indent, EOL)
//@ts-ignore
const Line$$ = [Line$0,Line$1]
//@ts-ignore
function Line(ctx, state) { return $EVENT_C(ctx, state, "Line", Line$$) }

//@ts-ignore
const Indent$0 = $Q($EXPECT($L0, "Indent \"  \""))
//@ts-ignore
function Indent(ctx, state) { return $EVENT(ctx, state, "Indent", Indent$0) }

//@ts-ignore
const Content$0 = Statement
//@ts-ignore
const Content$1 = Expression
//@ts-ignore
const Content$$ = [Content$0,Content$1]
//@ts-ignore
function Content(ctx, state) { return $EVENT_C(ctx, state, "Content", Content$$) }

//@ts-ignore
const Expression$0 = Applied
//@ts-ignore
function Expression(ctx, state) { return $EVENT(ctx, state, "Expression", Expression$0) }

//@ts-ignore
const Applied$0 = $S(Operated, $E(Application))
//@ts-ignore
function Applied(ctx, state) { return $EVENT(ctx, state, "Applied", Applied$0) }

//@ts-ignore
const Application$0 = $EXPECT($L1, "Application \"()\"")
//@ts-ignore
const Application$1 = $S(__, $EXPECT($L2, "Application \"(\""), ArgumentList, $EXPECT($L3, "Application \")\""))
//@ts-ignore
const Application$2 = $S($P(Space), ArgumentList)
//@ts-ignore
const Application$$ = [Application$0,Application$1,Application$2]
//@ts-ignore
function Application(ctx, state) { return $EVENT_C(ctx, state, "Application", Application$$) }

//@ts-ignore
const ArgumentList$0 = $S(Expression, $Q($S(__, $EXPECT($L4, "ArgumentList \",\""), __, Expression)))
//@ts-ignore
function ArgumentList(ctx, state) { return $EVENT(ctx, state, "ArgumentList", ArgumentList$0) }

//@ts-ignore
const Operated$0 = $S(Assigned, $Q($S(__, BinaryOp, __, Assigned)))
//@ts-ignore
const Operated$1 = $S($Q(UnaryOp), Assigned)
//@ts-ignore
const Operated$$ = [Operated$0,Operated$1]
//@ts-ignore
function Operated(ctx, state) { return $EVENT_C(ctx, state, "Operated", Operated$$) }

//@ts-ignore
const Assigned$0 = $S($P($S(Accessed, __, $EXPECT($L5, "Assigned \"=\""), __)), Expression)
//@ts-ignore
const Assigned$1 = Accessed
//@ts-ignore
const Assigned$$ = [Assigned$0,Assigned$1]
//@ts-ignore
function Assigned(ctx, state) { return $EVENT_C(ctx, state, "Assigned", Assigned$$) }

//@ts-ignore
const Accessed$0 = $S(Primary, $Q(Access))
//@ts-ignore
function Accessed(ctx, state) { return $EVENT(ctx, state, "Accessed", Accessed$0) }

//@ts-ignore
const Access$0 = $S($E($EXPECT($L6, "Access \"?\"")), $EXPECT($L7, "Access \".\""), Name)
//@ts-ignore
const Access$1 = $S($E($EXPECT($L6, "Access \"?\"")), $EXPECT($L8, "Access \"[\""), Expression, $EXPECT($L9, "Access \"]\""))
//@ts-ignore
const Access$$ = [Access$0,Access$1]
//@ts-ignore
function Access(ctx, state) { return $EVENT_C(ctx, state, "Access", Access$$) }

//@ts-ignore
const Primary$0 = $S($EXPECT($L2, "Primary \"(\""), Expression, $EXPECT($L3, "Primary \")\""))
//@ts-ignore
const Primary$1 = Function
//@ts-ignore
const Primary$2 = Literal
//@ts-ignore
const Primary$3 = Name
//@ts-ignore
const Primary$$ = [Primary$0,Primary$1,Primary$2,Primary$3]
//@ts-ignore
function Primary(ctx, state) { return $EVENT_C(ctx, state, "Primary", Primary$$) }

//@ts-ignore
const This$0 = $EXPECT($L10, "This \"this\"")
//@ts-ignore
const This$1 = $EXPECT($L11, "This \"@\"")
//@ts-ignore
const This$$ = [This$0,This$1]
//@ts-ignore
function This(ctx, state) { return $EVENT_C(ctx, state, "This", This$$) }

//@ts-ignore
const Function$0 = $S(Parameters, $EXPECT($L12, "Function \"->\""))
//@ts-ignore
function Function(ctx, state) { return $EVENT(ctx, state, "Function", Function$0) }

//@ts-ignore
const Literal$0 = StringValue
//@ts-ignore
const Literal$1 = Numeric
//@ts-ignore
const Literal$2 = $EXPECT($L13, "Literal \"true\"")
//@ts-ignore
const Literal$3 = $EXPECT($L14, "Literal \"false\"")
//@ts-ignore
const Literal$4 = $EXPECT($L15, "Literal \"null\"")
//@ts-ignore
const Literal$5 = $EXPECT($L16, "Literal \"undefined\"")
//@ts-ignore
const Literal$$ = [Literal$0,Literal$1,Literal$2,Literal$3,Literal$4,Literal$5]
//@ts-ignore
function Literal(ctx, state) { return $EVENT_C(ctx, state, "Literal", Literal$$) }

//@ts-ignore
const Parameters$0 = $S($EXPECT($L2, "Parameters \"(\""), Name, $P($S(Comma, Name)), $EXPECT($L3, "Parameters \")\""))
//@ts-ignore
const Parameters$1 = $S($EXPECT($L2, "Parameters \"(\""), Name, $EXPECT($L3, "Parameters \")\""))
//@ts-ignore
const Parameters$2 = $EXPECT($L17, "Parameters \"\"")
//@ts-ignore
const Parameters$$ = [Parameters$0,Parameters$1,Parameters$2]
//@ts-ignore
function Parameters(ctx, state) { return $EVENT_C(ctx, state, "Parameters", Parameters$$) }

//@ts-ignore
const Comma$0 = $S($Q(Space), $EXPECT($L4, "Comma \",\""), $Q(Space))
//@ts-ignore
function Comma(ctx, state) { return $EVENT(ctx, state, "Comma", Comma$0) }

//@ts-ignore
const Name$0 = $R$0($EXPECT($R0, "Name /[$a-zA-Z_][$a-zA-Z0-9_]*/"))
//@ts-ignore
function Name(ctx, state) { return $EVENT(ctx, state, "Name", Name$0) }

//@ts-ignore
const BinaryOp$0 = $EXPECT($L18, "BinaryOp \"+\"")
//@ts-ignore
const BinaryOp$1 = $EXPECT($L19, "BinaryOp \"-\"")
//@ts-ignore
const BinaryOp$2 = $EXPECT($L20, "BinaryOp \"*\"")
//@ts-ignore
const BinaryOp$3 = $EXPECT($L21, "BinaryOp \"/\"")
//@ts-ignore
const BinaryOp$4 = $EXPECT($L22, "BinaryOp \"and\"")
//@ts-ignore
const BinaryOp$5 = $EXPECT($L23, "BinaryOp \"&&\"")
//@ts-ignore
const BinaryOp$6 = $EXPECT($L24, "BinaryOp \"or\"")
//@ts-ignore
const BinaryOp$7 = $EXPECT($L25, "BinaryOp \"||\"")
//@ts-ignore
const BinaryOp$$ = [BinaryOp$0,BinaryOp$1,BinaryOp$2,BinaryOp$3,BinaryOp$4,BinaryOp$5,BinaryOp$6,BinaryOp$7]
//@ts-ignore
function BinaryOp(ctx, state) { return $EVENT_C(ctx, state, "BinaryOp", BinaryOp$$) }

//@ts-ignore
const UnaryOp$0 = $R$0($EXPECT($R1, "UnaryOp /[!~+-]/"))
//@ts-ignore
function UnaryOp(ctx, state) { return $EVENT(ctx, state, "UnaryOp", UnaryOp$0) }

//@ts-ignore
const Statement$0 = Import
//@ts-ignore
const Statement$1 = Export
//@ts-ignore
const Statement$$ = [Statement$0,Statement$1]
//@ts-ignore
function Statement(ctx, state) { return $EVENT_C(ctx, state, "Statement", Statement$$) }

//@ts-ignore
const Import$0 = $R$0($EXPECT($R2, "Import /import[^\\r\\n]*/"))
//@ts-ignore
function Import(ctx, state) { return $EVENT(ctx, state, "Import", Import$0) }

//@ts-ignore
const Export$0 = $R$0($EXPECT($R3, "Export /export[^\\r\\n]*/"))
//@ts-ignore
function Export(ctx, state) { return $EVENT(ctx, state, "Export", Export$0) }

//@ts-ignore
const Numeric$0 = $R$0($EXPECT($R4, "Numeric /\\d+(?:\\.\\d*)?/"))
//@ts-ignore
function Numeric(ctx, state) { return $EVENT(ctx, state, "Numeric", Numeric$0) }

//@ts-ignore
const StringValue$0 = $T($S($EXPECT($L26, "StringValue \"\\\\\\\"\""), $TEXT($Q(DoubleStringCharacter)), $EXPECT($L26, "StringValue \"\\\\\\\"\"")), function(value) {return value[1] });
//@ts-ignore
const StringValue$1 = $T($S($EXPECT($L27, "StringValue \"\\\\'\""), $TEXT($Q(SingleStringCharacter)), $EXPECT($L27, "StringValue \"\\\\'\"")), function(value) {return value[1] });
//@ts-ignore
const StringValue$$ = [StringValue$0,StringValue$1]
//@ts-ignore
function StringValue(ctx, state) { return $EVENT_C(ctx, state, "StringValue", StringValue$$) }

//@ts-ignore
const DoubleStringCharacter$0 = $R$0($EXPECT($R5, "DoubleStringCharacter /[^\"\\\\]+/"))
//@ts-ignore
const DoubleStringCharacter$1 = EscapeSequence
//@ts-ignore
const DoubleStringCharacter$$ = [DoubleStringCharacter$0,DoubleStringCharacter$1]
//@ts-ignore
function DoubleStringCharacter(ctx, state) { return $EVENT_C(ctx, state, "DoubleStringCharacter", DoubleStringCharacter$$) }

//@ts-ignore
const SingleStringCharacter$0 = $R$0($EXPECT($R6, "SingleStringCharacter /[^'\\\\]+/"))
//@ts-ignore
const SingleStringCharacter$1 = EscapeSequence
//@ts-ignore
const SingleStringCharacter$$ = [SingleStringCharacter$0,SingleStringCharacter$1]
//@ts-ignore
function SingleStringCharacter(ctx, state) { return $EVENT_C(ctx, state, "SingleStringCharacter", SingleStringCharacter$$) }

//@ts-ignore
const EscapeSequence$0 = $TEXT($S($EXPECT($L28, "EscapeSequence \"\\\\\\\\\""), $EXPECT($R7, "EscapeSequence /./")))
//@ts-ignore
function EscapeSequence(ctx, state) { return $EVENT(ctx, state, "EscapeSequence", EscapeSequence$0) }

//@ts-ignore
const Space$0 = $R$0($EXPECT($R8, "Space /[\\t ]/"))
//@ts-ignore
function Space(ctx, state) { return $EVENT(ctx, state, "Space", Space$0) }

//@ts-ignore
const __$0 = $R$0($EXPECT($R9, "__ /\\s*/"))
//@ts-ignore
function __(ctx, state) { return $EVENT(ctx, state, "__", __$0) }

//@ts-ignore
const EOL$0 = $R$0($EXPECT($R10, "EOL /\\r\\n|\\n|\\r/"))
//@ts-ignore
function EOL(ctx, state) { return $EVENT(ctx, state, "EOL", EOL$0) }



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
  Grammar,
  Line,
  Indent,
  Content,
  Expression,
  Applied,
  Application,
  ArgumentList,
  Operated,
  Assigned,
  Accessed,
  Access,
  Primary,
  This,
  Function,
  Literal,
  Parameters,
  Comma,
  Name,
  BinaryOp,
  UnaryOp,
  Statement,
  Import,
  Export,
  Numeric,
  StringValue,
  DoubleStringCharacter,
  SingleStringCharacter,
  EscapeSequence,
  Space,
  __,
  EOL
}


//@ts-nocheck
