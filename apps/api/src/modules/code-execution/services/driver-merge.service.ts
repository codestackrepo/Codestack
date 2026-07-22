import { Injectable } from '@nestjs/common';

/**
 * Merges instructor driver code with the candidate's code by replacing the
 * `{{ user_code }}` / `{{user_code}}` token. Deliberately a strict token
 * replace (NOT a template engine) to avoid SSTI/injection from user code.
 */
@Injectable()
export class DriverMergeService {
  private static readonly TOKEN = /\{\{\s*user_code\s*\}\}/g;

  merge(driverCode: string, userCode: string): string {
    if (!driverCode || !DriverMergeService.TOKEN.test(driverCode)) {
      // No harness / no placeholder: run the user's code directly.
      return userCode;
    }
    // Reset lastIndex (test() with /g advances it) before replace.
    DriverMergeService.TOKEN.lastIndex = 0;
    return driverCode.replace(DriverMergeService.TOKEN, () => userCode);
  }
}
