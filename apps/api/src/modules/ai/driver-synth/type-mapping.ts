import { IoType } from '../llm/schemas/generated-problem.schema';

export type Primitive = 'int' | 'long' | 'double' | 'string' | 'bool';

export function isArrayType(t: IoType): t is { array: Primitive } {
  return typeof t === 'object' && t !== null && 'array' in t;
}

export function isMatrixType(t: IoType): t is { matrix: Primitive } {
  return typeof t === 'object' && t !== null && 'matrix' in t;
}

export function primitiveOf(t: IoType): Primitive {
  if (typeof t === 'string') return t;
  return isArrayType(t) ? t.array : t.matrix;
}

const JAVA_SCALAR: Record<Primitive, string> = {
  int: 'int',
  long: 'long',
  double: 'double',
  string: 'String',
  bool: 'boolean',
};

const JAVA_SUFFIX: Record<Primitive, string> = {
  int: 'Int',
  long: 'Long',
  double: 'Double',
  string: 'Str',
  bool: 'Bool',
};

export function javaType(t: IoType): string {
  const scalar = JAVA_SCALAR[primitiveOf(t)];
  if (typeof t === 'string') return scalar;
  return isMatrixType(t) ? `${scalar}[][]` : `${scalar}[]`;
}

/** Fully-qualified `__Json.toXxx[Arr|Mat]` extractor call name for this type. */
export function javaExtractor(t: IoType): string {
  const suffix = JAVA_SUFFIX[primitiveOf(t)];
  if (typeof t === 'string') return `__Json.to${suffix}`;
  return isMatrixType(t) ? `__Json.to${suffix}Mat` : `__Json.to${suffix}Arr`;
}

/** Expression that serializes `varName` (of type `t`) to a JSON stdout line. */
export function javaSerializeExpr(t: IoType, varName: string): string {
  if (typeof t === 'string') {
    return t === 'string' ? `__Json.quote(${varName})` : varName;
  }
  return `__Json.arr(${varName})`;
}

const CPP_SCALAR: Record<Primitive, string> = {
  int: 'int',
  long: 'long long',
  double: 'double',
  string: 'std::string',
  bool: 'bool',
};

const CPP_SUFFIX: Record<Primitive, string> = {
  int: 'Int',
  long: 'Long',
  double: 'Double',
  string: 'Str',
  bool: 'Bool',
};

export function cppType(t: IoType): string {
  const scalar = CPP_SCALAR[primitiveOf(t)];
  if (typeof t === 'string') return scalar;
  return isMatrixType(t) ? `std::vector<std::vector<${scalar}>>` : `std::vector<${scalar}>`;
}

/** Free-function `asXxx[Arr|Mat]` extractor call name for this type. */
export function cppExtractor(t: IoType): string {
  const suffix = CPP_SUFFIX[primitiveOf(t)];
  if (typeof t === 'string') return `as${suffix}`;
  return isMatrixType(t) ? `as${suffix}Mat` : `as${suffix}Arr`;
}

/** `toJson(varName)` — overload resolution picks the right serializer by static type. */
export function cppSerializeExpr(varName: string): string {
  return `toJson(${varName})`;
}
