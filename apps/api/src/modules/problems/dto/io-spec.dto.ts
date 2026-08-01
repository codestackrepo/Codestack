import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsString,
  Matches,
  MaxLength,
  ValidateNested,
  ValidatorConstraint,
  ValidatorConstraintInterface,
  Validate,
} from 'class-validator';
import { IoPrimitive, IoType } from '../../code-execution/driver-synth/io-spec.types';

const IO_PRIMITIVES: readonly IoPrimitive[] = ['int', 'long', 'double', 'string', 'bool'];

/**
 * Identifiers here are INTERPOLATED INTO GENERATED SOURCE CODE.
 *
 * `driver-synth` builds a Java/C++/Python/JS driver by substituting the function name
 * and each parameter name into a template, so anything accepted here is compiled and
 * run inside the sandbox. A value like `x); System.exit(1); //` would not be a bad
 * name, it would be an injection into the driver — which is why this is an
 * allow-list of identifier characters rather than a length check or an escape pass.
 *
 * Deliberately stricter than any single target language: no `$`, no Unicode letters,
 * no leading digit. The intersection of what Java, C++, Python and JS all accept is
 * the only safe common ground, and a rejected legitimate name costs an author one
 * rename.
 */
const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

/**
 * Words that are an identifier in the regex sense but break at least one generated
 * language. Rejected up front so the failure is a 400 at authoring time rather than a
 * compile error every solver sees at judge time.
 */
const RESERVED = new Set([
  // shared across the four target languages
  'class',
  'int',
  'long',
  'double',
  'float',
  'char',
  'bool',
  'boolean',
  'void',
  'return',
  'if',
  'else',
  'for',
  'while',
  'do',
  'break',
  'continue',
  'switch',
  'case',
  'default',
  'new',
  'delete',
  'try',
  'catch',
  'throw',
  'const',
  'static',
  'public',
  'private',
  'protected',
  'import',
  'package',
  'namespace',
  'using',
  'template',
  'this',
  'null',
  'true',
  'false',
  'def',
  'lambda',
  'pass',
  'None',
  'True',
  'False',
  'function',
  'var',
  'let',
  'struct',
  'union',
  'enum',
  'operator',
  'main',
]);

@ValidatorConstraint({ name: 'isNotReservedWord', async: false })
export class IsNotReservedWordConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    return typeof value === 'string' && !RESERVED.has(value);
  }

  defaultMessage(): string {
    return 'that name is a reserved word in one of the judged languages — pick another';
  }
}

@ValidatorConstraint({ name: 'isIoType', async: false })
export class IsIoTypeConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    if (typeof value === 'string') return IO_PRIMITIVES.includes(value as IoPrimitive);
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const keys = Object.keys(value);
    // Exactly one key: `{array: 'int', matrix: 'int'}` is ambiguous, not a union of
    // both, and silently taking the first key would generate a driver for a type the
    // author did not choose.
    if (keys.length !== 1) return false;
    const kind = keys[0];
    if (kind !== 'array' && kind !== 'matrix') return false;
    return IO_PRIMITIVES.includes((value as Record<string, unknown>)[kind] as IoPrimitive);
  }

  defaultMessage(): string {
    return `type must be one of ${IO_PRIMITIVES.join(', ')}, or {"array":<primitive>} / {"matrix":<primitive>}`;
  }
}

export class IoParamDto {
  @ApiProperty({ example: 'nums', description: 'Parameter name, used verbatim in the driver.' })
  @IsString()
  @MaxLength(64)
  @Matches(IDENTIFIER, {
    message:
      'name must start with a letter or underscore and contain only letters, digits and underscores',
  })
  @Validate(IsNotReservedWordConstraint)
  name!: string;

  @ApiProperty({
    description: 'A primitive, or {"array":<primitive>} / {"matrix":<primitive>}.',
    example: { array: 'int' },
  })
  @Validate(IsIoTypeConstraint)
  type!: IoType;
}

export class IoSpecDto {
  @ApiProperty({ type: [IoParamDto] })
  @IsArray()
  @ArrayMinSize(1)
  // A judged signature with 20 parameters is a spec error, not a problem.
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => IoParamDto)
  params!: IoParamDto[];

  @ApiProperty({ description: 'Return type, same shape as a parameter type.', example: 'int' })
  @Validate(IsIoTypeConstraint)
  returns!: IoType;
}

export { IDENTIFIER, RESERVED };
