import { Injectable } from '@nestjs/common';
import { Language } from '../../../common/enums/language.enum';
import { IoSpec } from '../llm/schemas/generated-problem.schema';
import { cppDriver } from './templates/cpp.template';
import { javaDriver } from './templates/java.template';
import { javascriptDriver } from './templates/javascript.template';
import { pythonDriver } from './templates/python.template';

/**
 * Deterministically generates each language's judge-compatible driver_code
 * from a problem's io_spec — the LLM never authors test harnesses. Every
 * template embeds a literal `{{user_code}}` token consumed by the existing
 * DriverMergeService, so generated problems run through the exact same merge
 * + execute + verdict pipeline as human-authored ones.
 *
 * Param `name`s are intentionally never spliced into generated source (only
 * `type`, positionally, is used) — codegen always uses synthetic `__argN`
 * identifiers, so a param name is never trusted as a source-code identifier.
 */
@Injectable()
export class DriverSynthService {
  synthesize(language: Language, functionName: string, ioSpec: IoSpec): string {
    switch (language) {
      case Language.PYTHON:
        return pythonDriver(functionName, ioSpec);
      case Language.JAVASCRIPT:
        return javascriptDriver(functionName, ioSpec);
      case Language.JAVA:
        return javaDriver(functionName, ioSpec);
      case Language.CPP:
        return cppDriver(functionName, ioSpec);
    }
  }
}
