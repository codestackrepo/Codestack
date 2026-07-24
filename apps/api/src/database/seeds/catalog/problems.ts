import type { CatalogProblem } from './schema';

/**
 * The authored starter catalog. Every problem is original (see LICENSING.md),
 * judge-ready by synthesis (ioSpec + functionName), and ships Python +
 * JavaScript reference solutions that pass all listed test cases.
 *
 * Return types are scalars only (int/long/string/bool) so json.dumps (Python)
 * and JSON.stringify (JS) produce byte-identical output — no dependence on
 * output normalization. Add more problems below following the same pattern,
 * then re-run `seed-catalog --validate`.
 */
export const catalogProblems: CatalogProblem[] = [
  {
    slug: 'sum-array',
    title: 'Sum of an Array',
    statementMarkdown:
      'Given an integer array `nums`, return the sum of all its elements. The sum of an empty array is `0`.\n\n## Examples\n\n### Example 1\n- Input: `nums = [1, 2, 3]`\n- Output: `6`\n- Explanation: `1 + 2 + 3 = 6`.\n\n### Example 2\n- Input: `nums = [-5, 5]`\n- Output: `0`\n- Explanation: The positive and negative values cancel out.\n\n## Constraints\n- `0 <= nums.length <= 10^4`\n- `-10^4 <= nums[i] <= 10^4`\n- The sum always fits in a 32-bit signed integer.',
    difficulty: 'easy',
    tags: ['arrays', 'math'],
    companies: ['Acme', 'Globex'],
    functionName: 'sumArray',
    ioSpec: { params: [{ name: 'nums', type: { array: 'int' } }], returns: 'int' },
    referenceSolution: {
      python: 'def sumArray(nums):\n    return sum(nums)\n',
      javascript: 'function sumArray(nums) {\n  return nums.reduce((a, b) => a + b, 0);\n}\n',
    },
    starterCode: {
      python: 'def sumArray(nums):\n    # TODO: return the sum of nums\n    pass\n',
      javascript: 'function sumArray(nums) {\n  // TODO: return the sum of nums\n}\n',
    },
    sampleTestcases: [{ inputs: [[1, 2, 3]], expected: 6, explanation: '1 + 2 + 3 = 6' }],
    hiddenTestcases: [
      { inputs: [[]], expected: 0 },
      { inputs: [[-1, 1]], expected: 0 },
      { inputs: [[10, 20, 30, 40]], expected: 100 },
      { inputs: [[5]], expected: 5 },
    ],
  },
  {
    slug: 'reverse-string',
    title: 'Reverse a String',
    statementMarkdown:
      'Given a string `s`, return a new string with the characters of `s` in reverse order.\n\n## Examples\n\n### Example 1\n- Input: `s = \"hello\"`\n- Output: `\"olleh\"`\n\n### Example 2\n- Input: `s = \"racecar\"`\n- Output: `\"racecar\"`\n- Explanation: A palindrome reversed is itself.\n\n## Constraints\n- `0 <= s.length <= 10^4`\n- `s` may contain any printable ASCII characters.',
    difficulty: 'easy',
    tags: ['strings'],
    companies: ['Acme'],
    functionName: 'reverseString',
    ioSpec: { params: [{ name: 's', type: 'string' }], returns: 'string' },
    referenceSolution: {
      python: 'def reverseString(s):\n    return s[::-1]\n',
      javascript: "function reverseString(s) {\n  return s.split('').reverse().join('');\n}\n",
    },
    starterCode: {
      python: 'def reverseString(s):\n    # TODO\n    pass\n',
      javascript: 'function reverseString(s) {\n  // TODO\n}\n',
    },
    sampleTestcases: [{ inputs: ['hello'], expected: 'olleh' }],
    hiddenTestcases: [
      { inputs: ['a'], expected: 'a' },
      { inputs: [''], expected: '' },
      { inputs: ['abcd'], expected: 'dcba' },
      { inputs: ['racecar'], expected: 'racecar' },
    ],
  },
  {
    slug: 'count-vowels',
    title: 'Count Vowels',
    statementMarkdown:
      'Given a string `s`, return the number of vowels it contains. The vowels are `a`, `e`, `i`, `o`, and `u`, matched case-insensitively (both `a` and `A` count).\n\n## Examples\n\n### Example 1\n- Input: `s = \"hello\"`\n- Output: `2`\n- Explanation: The vowels are `e` and `o`.\n\n### Example 2\n- Input: `s = \"AEIOU\"`\n- Output: `5`\n\n## Constraints\n- `0 <= s.length <= 10^4`\n- `s` may contain letters, digits, spaces, and punctuation.',
    difficulty: 'easy',
    tags: ['strings'],
    companies: ['Globex'],
    functionName: 'countVowels',
    ioSpec: { params: [{ name: 's', type: 'string' }], returns: 'int' },
    referenceSolution: {
      python: "def countVowels(s):\n    return sum(1 for c in s.lower() if c in 'aeiou')\n",
      javascript: 'function countVowels(s) {\n  return (s.match(/[aeiou]/gi) || []).length;\n}\n',
    },
    starterCode: {
      python: 'def countVowels(s):\n    # TODO\n    pass\n',
      javascript: 'function countVowels(s) {\n  // TODO\n}\n',
    },
    sampleTestcases: [{ inputs: ['hello'], expected: 2 }],
    hiddenTestcases: [
      { inputs: ['xyz'], expected: 0 },
      { inputs: ['AEIOU'], expected: 5 },
      { inputs: ['programming'], expected: 3 },
      { inputs: [''], expected: 0 },
    ],
  },
  {
    slug: 'max-element',
    title: 'Maximum Element',
    statementMarkdown:
      'Given a non-empty integer array `nums`, return its largest element.\n\n## Examples\n\n### Example 1\n- Input: `nums = [3, 1, 2]`\n- Output: `3`\n\n### Example 2\n- Input: `nums = [-5, -1, -3]`\n- Output: `-1`\n- Explanation: `-1` is the greatest of the negative values.\n\n## Constraints\n- `1 <= nums.length <= 10^4`\n- `-10^9 <= nums[i] <= 10^9`',
    difficulty: 'easy',
    tags: ['arrays'],
    companies: ['Initech'],
    functionName: 'maxElement',
    ioSpec: { params: [{ name: 'nums', type: { array: 'int' } }], returns: 'int' },
    referenceSolution: {
      python: 'def maxElement(nums):\n    return max(nums)\n',
      javascript: 'function maxElement(nums) {\n  return Math.max(...nums);\n}\n',
    },
    starterCode: {
      python: 'def maxElement(nums):\n    # TODO\n    pass\n',
      javascript: 'function maxElement(nums) {\n  // TODO\n}\n',
    },
    sampleTestcases: [{ inputs: [[3, 1, 2]], expected: 3 }],
    hiddenTestcases: [
      { inputs: [[-5, -1, -3]], expected: -1 },
      { inputs: [[42]], expected: 42 },
      { inputs: [[7, 7, 7]], expected: 7 },
    ],
  },
  {
    slug: 'is-palindrome',
    title: 'Palindrome Check',
    statementMarkdown:
      'Given a string `s`, return `true` if it reads the same forwards and backwards, and `false` otherwise. The comparison is exact: every character, including case and spaces, must match its mirror position.\n\n## Examples\n\n### Example 1\n- Input: `s = \"racecar\"`\n- Output: `true`\n\n### Example 2\n- Input: `s = \"hello\"`\n- Output: `false`\n- Explanation: Reversed, `\"hello\"` becomes `\"olleh\"`, which differs from the original.\n\n## Constraints\n- `0 <= s.length <= 10^4`\n- An empty string counts as a palindrome.',
    difficulty: 'easy',
    tags: ['strings', 'two-pointers'],
    companies: ['Acme', 'Initech'],
    functionName: 'isPalindrome',
    ioSpec: { params: [{ name: 's', type: 'string' }], returns: 'bool' },
    referenceSolution: {
      python: 'def isPalindrome(s):\n    return s == s[::-1]\n',
      javascript: "function isPalindrome(s) {\n  return s === s.split('').reverse().join('');\n}\n",
    },
    starterCode: {
      python: 'def isPalindrome(s):\n    # TODO\n    pass\n',
      javascript: 'function isPalindrome(s) {\n  // TODO\n}\n',
    },
    sampleTestcases: [{ inputs: ['racecar'], expected: true }],
    hiddenTestcases: [
      { inputs: ['hello'], expected: false },
      { inputs: ['a'], expected: true },
      { inputs: ['abba'], expected: true },
      { inputs: ['ab'], expected: false },
    ],
  },
  {
    slug: 'factorial',
    title: 'Factorial',
    statementMarkdown:
      'The factorial of a non-negative integer `n`, written `n!`, is the product of every integer from `1` to `n`. By definition `0!` is `1`.\n\nGiven `n`, return `n!`.\n\n## Examples\n\n### Example 1\n- Input: `n = 5`\n- Output: `120`\n- Explanation: `5! = 5 x 4 x 3 x 2 x 1 = 120`.\n\n### Example 2\n- Input: `n = 0`\n- Output: `1`\n\n## Constraints\n- `0 <= n <= 20`\n- The result can be large, so it is returned as a 64-bit integer.',
    difficulty: 'easy',
    tags: ['math', 'recursion'],
    companies: ['Globex'],
    functionName: 'factorial',
    ioSpec: { params: [{ name: 'n', type: 'int' }], returns: 'long' },
    referenceSolution: {
      python:
        'def factorial(n):\n    result = 1\n    for i in range(2, n + 1):\n        result *= i\n    return result\n',
      javascript:
        'function factorial(n) {\n  let result = 1;\n  for (let i = 2; i <= n; i++) result *= i;\n  return result;\n}\n',
    },
    starterCode: {
      python: 'def factorial(n):\n    # TODO\n    pass\n',
      javascript: 'function factorial(n) {\n  // TODO\n}\n',
    },
    sampleTestcases: [{ inputs: [5], expected: 120 }],
    hiddenTestcases: [
      { inputs: [0], expected: 1 },
      { inputs: [1], expected: 1 },
      { inputs: [10], expected: 3628800 },
    ],
  },
  {
    slug: 'fizz-buzz-count',
    title: 'FizzBuzz Count',
    statementMarkdown:
      'Given an integer `n`, count how many integers from `1` to `n` (inclusive) are divisible by `3` or by `5`.\n\n## Examples\n\n### Example 1\n- Input: `n = 15`\n- Output: `7`\n- Explanation: The qualifying numbers are `3, 5, 6, 9, 10, 12, 15` — seven in total.\n\n### Example 2\n- Input: `n = 10`\n- Output: `5`\n- Explanation: `3, 5, 6, 9, 10`.\n\n## Constraints\n- `0 <= n <= 10^6`\n- If `n < 1` there is nothing to count, so the answer is `0`.',
    difficulty: 'easy',
    tags: ['math'],
    companies: ['Initech'],
    functionName: 'fizzBuzzCount',
    ioSpec: { params: [{ name: 'n', type: 'int' }], returns: 'int' },
    referenceSolution: {
      python:
        'def fizzBuzzCount(n):\n    return sum(1 for i in range(1, n + 1) if i % 3 == 0 or i % 5 == 0)\n',
      javascript:
        'function fizzBuzzCount(n) {\n  let c = 0;\n  for (let i = 1; i <= n; i++) if (i % 3 === 0 || i % 5 === 0) c++;\n  return c;\n}\n',
    },
    starterCode: {
      python: 'def fizzBuzzCount(n):\n    # TODO\n    pass\n',
      javascript: 'function fizzBuzzCount(n) {\n  // TODO\n}\n',
    },
    sampleTestcases: [{ inputs: [15], expected: 7, explanation: '3,5,6,9,10,12,15' }],
    hiddenTestcases: [
      { inputs: [1], expected: 0 },
      { inputs: [10], expected: 5 },
      { inputs: [0], expected: 0 },
    ],
  },
  {
    slug: 'greatest-common-divisor',
    title: 'Greatest Common Divisor',
    statementMarkdown:
      'The greatest common divisor (GCD) of two integers is the largest positive integer that divides both without a remainder. By convention `gcd(x, 0)` is `x`.\n\nGiven two non-negative integers `a` and `b` (not both zero), return their GCD.\n\n## Examples\n\n### Example 1\n- Input: `a = 12, b = 8`\n- Output: `4`\n- Explanation: The common divisors of `12` and `8` are `1, 2, 4`; the greatest is `4`.\n\n### Example 2\n- Input: `a = 0, b = 7`\n- Output: `7`\n\n## Constraints\n- `0 <= a, b <= 10^9`\n- `a` and `b` are not both zero.',
    difficulty: 'medium',
    tags: ['math'],
    companies: ['Acme', 'Globex'],
    functionName: 'gcd',
    ioSpec: {
      params: [
        { name: 'a', type: 'int' },
        { name: 'b', type: 'int' },
      ],
      returns: 'int',
    },
    referenceSolution: {
      python: 'def gcd(a, b):\n    while b:\n        a, b = b, a % b\n    return a\n',
      javascript:
        'function gcd(a, b) {\n  while (b) {\n    [a, b] = [b, a % b];\n  }\n  return a;\n}\n',
    },
    starterCode: {
      python: 'def gcd(a, b):\n    # TODO\n    pass\n',
      javascript: 'function gcd(a, b) {\n  // TODO\n}\n',
    },
    sampleTestcases: [{ inputs: [12, 8], expected: 4 }],
    hiddenTestcases: [
      { inputs: [17, 5], expected: 1 },
      { inputs: [100, 10], expected: 10 },
      { inputs: [0, 7], expected: 7 },
    ],
  },
  {
    slug: 'second-largest',
    title: 'Second Largest',
    statementMarkdown:
      'Given an integer array `nums`, return the second largest **distinct** value. If the array has only one distinct value, return that value.\n\n## Examples\n\n### Example 1\n- Input: `nums = [1, 2, 3, 4]`\n- Output: `3`\n- Explanation: The largest distinct value is `4`; the second largest is `3`.\n\n### Example 2\n- Input: `nums = [7, 7, 7]`\n- Output: `7`\n- Explanation: There is only one distinct value, so it is returned.\n\n## Constraints\n- `1 <= nums.length <= 10^4`\n- `-10^9 <= nums[i] <= 10^9`\n- Duplicate values are ignored when ranking.',
    difficulty: 'medium',
    tags: ['arrays', 'sorting'],
    companies: ['Initech'],
    functionName: 'secondLargest',
    ioSpec: { params: [{ name: 'nums', type: { array: 'int' } }], returns: 'int' },
    referenceSolution: {
      python:
        'def secondLargest(nums):\n    u = sorted(set(nums))\n    return u[-2] if len(u) >= 2 else u[-1]\n',
      javascript:
        'function secondLargest(nums) {\n  const u = [...new Set(nums)].sort((a, b) => a - b);\n  return u.length >= 2 ? u[u.length - 2] : u[u.length - 1];\n}\n',
    },
    starterCode: {
      python: 'def secondLargest(nums):\n    # TODO\n    pass\n',
      javascript: 'function secondLargest(nums) {\n  // TODO\n}\n',
    },
    sampleTestcases: [{ inputs: [[1, 2, 3, 4]], expected: 3 }],
    hiddenTestcases: [
      { inputs: [[5, 5, 4]], expected: 4 },
      { inputs: [[10, 20]], expected: 10 },
      { inputs: [[7, 7, 7]], expected: 7 },
      { inputs: [[3, 1, 2]], expected: 2 },
    ],
  },
  {
    slug: 'sum-even-numbers',
    title: 'Sum of Even Numbers',
    statementMarkdown:
      'Given an integer array `nums`, return the sum of its even-valued elements. If there are no even numbers, return `0`.\n\n## Examples\n\n### Example 1\n- Input: `nums = [1, 2, 3, 4]`\n- Output: `6`\n- Explanation: The even values are `2` and `4`, and `2 + 4 = 6`.\n\n### Example 2\n- Input: `nums = [1, 3, 5]`\n- Output: `0`\n- Explanation: There are no even numbers.\n\n## Constraints\n- `0 <= nums.length <= 10^4`\n- `-10^4 <= nums[i] <= 10^4`',
    difficulty: 'easy',
    tags: ['arrays', 'math'],
    companies: ['Globex'],
    functionName: 'sumEven',
    ioSpec: { params: [{ name: 'nums', type: { array: 'int' } }], returns: 'int' },
    referenceSolution: {
      python: 'def sumEven(nums):\n    return sum(x for x in nums if x % 2 == 0)\n',
      javascript:
        'function sumEven(nums) {\n  return nums.filter((x) => x % 2 === 0).reduce((a, b) => a + b, 0);\n}\n',
    },
    starterCode: {
      python: 'def sumEven(nums):\n    # TODO\n    pass\n',
      javascript: 'function sumEven(nums) {\n  // TODO\n}\n',
    },
    sampleTestcases: [{ inputs: [[1, 2, 3, 4]], expected: 6 }],
    hiddenTestcases: [
      { inputs: [[1, 3, 5]], expected: 0 },
      { inputs: [[2, 4, 6]], expected: 12 },
      { inputs: [[]], expected: 0 },
    ],
  },
  {
    slug: 'count-words',
    title: 'Count Words',
    statementMarkdown:
      'Given a string `s`, return the number of words it contains. A word is a maximal run of non-whitespace characters, so words are separated by one or more spaces, tabs, or newlines. Leading and trailing whitespace does not create empty words.\n\n## Examples\n\n### Example 1\n- Input: `s = \"hello world\"`\n- Output: `2`\n\n### Example 2\n- Input: `s = \"  a  b  c \"`\n- Output: `3`\n- Explanation: Extra spaces are ignored; the words are `a`, `b`, and `c`.\n\n## Constraints\n- `0 <= s.length <= 10^4`\n- An empty or all-whitespace string has `0` words.',
    difficulty: 'easy',
    tags: ['strings'],
    companies: ['Acme'],
    functionName: 'countWords',
    ioSpec: { params: [{ name: 's', type: 'string' }], returns: 'int' },
    referenceSolution: {
      python: 'def countWords(s):\n    return len(s.split())\n',
      javascript:
        'function countWords(s) {\n  const t = s.trim();\n  return t ? t.split(/\\s+/).length : 0;\n}\n',
    },
    starterCode: {
      python: 'def countWords(s):\n    # TODO\n    pass\n',
      javascript: 'function countWords(s) {\n  // TODO\n}\n',
    },
    sampleTestcases: [{ inputs: ['hello world'], expected: 2 }],
    hiddenTestcases: [
      { inputs: ['one'], expected: 1 },
      { inputs: [''], expected: 0 },
      { inputs: ['  a  b  c '], expected: 3 },
    ],
  },
  {
    slug: 'digit-sum',
    title: 'Digit Sum',
    statementMarkdown:
      "A number's *digit sum* is the value you get by adding together every decimal digit of its absolute value. The sign of the input does not matter — only the digits do.\n\nGiven an integer `n`, return the sum of the decimal digits of `|n|`.\n\n## Examples\n\n**Example 1**\n\n- Input: `n = -472`\n- Output: `13`\n- Explanation: The absolute value is `472`, and `4 + 7 + 2 = 13`. The minus sign is ignored.\n\n**Example 2**\n\n- Input: `n = 0`\n- Output: `0`\n- Explanation: Zero has a single digit `0`, so the digit sum is `0`.\n\n## Constraints\n\n- `-1000000000 <= n <= 1000000000`\n- `n` is a whole number (it may be negative, zero, or positive).",
    difficulty: 'easy',
    tags: ['math'],
    companies: ['Acme', 'Initech'],
    functionName: 'digitSum',
    ioSpec: {
      params: [
        {
          name: 'n',
          type: 'int',
        },
      ],
      returns: 'int',
    },
    referenceSolution: {
      python:
        'def digitSum(n):\n    n = abs(n)\n    total = 0\n    while n > 0:\n        total += n % 10\n        n //= 10\n    return total\n',
      javascript:
        'function digitSum(n) {\n    n = Math.abs(n);\n    let total = 0;\n    while (n > 0) {\n        total += n % 10;\n        n = Math.floor(n / 10);\n    }\n    return total;\n}\n',
    },
    starterCode: {
      python:
        'def digitSum(n):\n    # TODO: return the sum of the decimal digits of abs(n)\n    pass\n',
      javascript:
        'function digitSum(n) {\n    // TODO: return the sum of the decimal digits of Math.abs(n)\n}\n',
    },
    sampleTestcases: [
      {
        inputs: [-472],
        expected: 13,
        explanation: 'abs(-472) = 472 and 4 + 7 + 2 = 13.',
      },
      {
        inputs: [0],
        expected: 0,
        explanation: 'The digit sum of 0 is 0.',
      },
    ],
    hiddenTestcases: [
      {
        inputs: [5],
        expected: 5,
        explanation: 'Single-digit positive number.',
      },
      {
        inputs: [-8],
        expected: 8,
        explanation: 'Single-digit negative number; sign is ignored.',
      },
      {
        inputs: [10],
        expected: 1,
        explanation: '1 + 0 = 1.',
      },
      {
        inputs: [-100],
        expected: 1,
        explanation: 'abs(-100) = 100 and 1 + 0 + 0 = 1.',
      },
      {
        inputs: [99999],
        expected: 45,
        explanation: 'Five identical digits: 9 * 5 = 45.',
      },
      {
        inputs: [12345],
        expected: 15,
        explanation: '1 + 2 + 3 + 4 + 5 = 15.',
      },
      {
        inputs: [987654321],
        expected: 45,
        explanation: '9 + 8 + 7 + 6 + 5 + 4 + 3 + 2 + 1 = 45.',
      },
      {
        inputs: [1000000000],
        expected: 1,
        explanation: 'Upper boundary: only the leading 1 contributes.',
      },
    ],
  },
  {
    slug: 'count-distinct-characters',
    title: 'Count Distinct Characters',
    statementMarkdown:
      'A librarian is cataloging the unique symbols used across a batch of scanned labels. For a single label represented by the string `s`, she needs to know how many **different** characters appear on it.\n\nWrite a function that returns the number of distinct characters in `s`. Counting is **case-sensitive**, so `\'a\'` and `\'A\'` are considered different characters. Each unique character is counted exactly once, no matter how many times it repeats. An empty string has `0` distinct characters.\n\n## Examples\n\n**Example 1**\n\n- Input: `s = "hello"`\n- Output: `4`\n- Explanation: The characters present are `h`, `e`, `l`, `o`. Although `l` appears twice, it is counted once, giving `4` distinct characters.\n\n**Example 2**\n\n- Input: `s = "aAaA"`\n- Output: `2`\n- Explanation: Comparison is case-sensitive, so `a` and `A` are two different characters. The string only uses these two symbols, so the answer is `2`.\n\n## Constraints\n\n- `0 <= len(s) <= 10000`\n- `s` consists of printable ASCII characters (letters, digits, spaces, and punctuation).',
    difficulty: 'easy',
    tags: ['strings', 'hashing'],
    companies: ['Acme', 'Hooli'],
    functionName: 'countDistinctChars',
    ioSpec: {
      params: [
        {
          name: 's',
          type: 'string',
        },
      ],
      returns: 'int',
    },
    referenceSolution: {
      python: 'def countDistinctChars(s):\n    return len(set(s))\n',
      javascript: 'function countDistinctChars(s) {\n  return new Set(s).size;\n}\n',
    },
    starterCode: {
      python:
        'def countDistinctChars(s):\n    # TODO: return the number of distinct (case-sensitive) characters in s\n    pass\n',
      javascript:
        'function countDistinctChars(s) {\n  // TODO: return the number of distinct (case-sensitive) characters in s\n}\n',
    },
    sampleTestcases: [
      {
        inputs: ['hello'],
        expected: 4,
        explanation: 'Distinct characters are h, e, l, o; the repeated l is counted once.',
      },
      {
        inputs: ['aAaA'],
        expected: 2,
        explanation:
          'Case-sensitive counting treats a and A as distinct, so there are 2 unique characters.',
      },
    ],
    hiddenTestcases: [
      {
        inputs: [''],
        expected: 0,
        explanation: 'An empty string has no characters.',
      },
      {
        inputs: ['a'],
        expected: 1,
        explanation: 'A single character yields one distinct character.',
      },
      {
        inputs: ['aaaa'],
        expected: 1,
        explanation: 'All characters are identical, so only one is distinct.',
      },
      {
        inputs: ['abcABC'],
        expected: 6,
        explanation: 'All six characters differ (lowercase vs uppercase are distinct).',
      },
      {
        inputs: ['112233'],
        expected: 3,
        explanation: 'The distinct digit characters are 1, 2, and 3.',
      },
      {
        inputs: ['The quick brown fox'],
        expected: 16,
        explanation:
          'Fifteen distinct letters plus the space character make 16 distinct characters.',
      },
      {
        inputs: ['a!a!b?'],
        expected: 4,
        explanation: 'Distinct characters are a, !, b, ?.',
      },
      {
        inputs: ['abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'],
        expected: 62,
        explanation: '26 lowercase + 26 uppercase letters + 10 digits, all distinct.',
      },
    ],
  },
  {
    slug: 'sum-odd-numbers',
    title: 'Sum of Odd Numbers',
    statementMarkdown:
      'A logistics dashboard tracks daily net changes in warehouse stock, where each value may be positive or negative. The analytics team only cares about the entries recorded with an *odd* magnitude, since those come from manual audits.\n\nGiven an integer array `nums`, return the sum of every element whose value is odd. A value is considered odd when it is not evenly divisible by 2, so negative odd numbers such as `-3` count as odd too. If no element is odd, return `0`.\n\nThe returned total may be large, so accumulate it in a 64-bit integer.\n\n## Examples\n\n### Example 1\n- Input: `nums = [1, 2, 3, 4, 5]`\n- Output: `9`\n- Explanation: The odd values are `1`, `3`, and `5`, and `1 + 3 + 5 = 9`.\n\n### Example 2\n- Input: `nums = [-3, -2, -1, 0]`\n- Output: `-4`\n- Explanation: The odd values are `-3` and `-1`. Their sum is `-3 + (-1) = -4`. The even values `-2` and `0` are ignored.\n\n## Constraints\n- `0 <= nums.length <= 100000`\n- `-1000000000 <= nums[i] <= 1000000000`\n- The sum of odd elements can exceed the 32-bit signed integer range, so use a 64-bit accumulator.',
    difficulty: 'easy',
    tags: ['arrays', 'math'],
    companies: ['Acme', 'Hooli'],
    functionName: 'sumOddNumbers',
    ioSpec: {
      params: [
        {
          name: 'nums',
          type: {
            array: 'int',
          },
        },
      ],
      returns: 'long',
    },
    referenceSolution: {
      python:
        'def sumOddNumbers(nums):\n    total = 0\n    for x in nums:\n        if x % 2 != 0:\n            total += x\n    return total\n',
      javascript:
        'function sumOddNumbers(nums) {\n    let total = 0;\n    for (const x of nums) {\n        if (x % 2 !== 0) {\n            total += x;\n        }\n    }\n    return total;\n}\n',
    },
    starterCode: {
      python:
        'def sumOddNumbers(nums):\n    # TODO: return the sum of all odd-valued elements of nums (0 if none)\n    pass\n',
      javascript:
        'function sumOddNumbers(nums) {\n    // TODO: return the sum of all odd-valued elements of nums (0 if none)\n}\n',
    },
    sampleTestcases: [
      {
        inputs: [[1, 2, 3, 4, 5]],
        expected: 9,
        explanation: 'Odd values 1, 3, 5 sum to 9.',
      },
      {
        inputs: [[-3, -2, -1, 0]],
        expected: -4,
        explanation: 'Odd values -3 and -1 sum to -4; even values are ignored.',
      },
    ],
    hiddenTestcases: [
      {
        inputs: [[]],
        expected: 0,
        explanation: 'Empty array has no odd elements, so the sum is 0.',
      },
      {
        inputs: [[7]],
        expected: 7,
        explanation: 'Single odd element.',
      },
      {
        inputs: [[8]],
        expected: 0,
        explanation: 'Single even element contributes nothing.',
      },
      {
        inputs: [[2, 4, 6, 8]],
        expected: 0,
        explanation: 'All elements are even.',
      },
      {
        inputs: [[-5, -5, -5]],
        expected: -15,
        explanation: 'Repeated negative odd values: -5 + -5 + -5 = -15.',
      },
      {
        inputs: [[999999999, 999999999, 999999999]],
        expected: 2999999997,
        explanation:
          'Three large odd values sum to 2999999997, which exceeds the 32-bit signed integer range.',
      },
      {
        inputs: [[0, 0, 11, -11]],
        expected: 0,
        explanation: 'Odd values 11 and -11 cancel to 0; the zeros are even.',
      },
      {
        inputs: [[15, 20, 25, -10, -5]],
        expected: 35,
        explanation: 'Odd values 15, 25, and -5 sum to 35.',
      },
    ],
  },
  {
    slug: 'count-uppercase-letters',
    title: 'Count Uppercase Letters',
    statementMarkdown:
      'A librarian is tagging book titles and wants to know how "shouty" each title is by counting its capital letters.\n\nGiven a string `s`, return the number of characters in `s` that are uppercase English letters (`A` through `Z`). Every other character — lowercase letters, digits, spaces, punctuation, and any non-English symbol — is ignored.\n\n## Examples\n\n**Example 1**\n\nInput: `s = "Hello World"`\nOutput: `2`\nExplanation: Only `H` and `W` are uppercase English letters, so the count is `2`.\n\n**Example 2**\n\nInput: `s = "CodeStack Rocks 2026"`\nOutput: `3`\nExplanation: The uppercase letters are `C`, `S`, and `R`. Digits and spaces do not count, giving `3`.\n\n## Constraints\n\n- `0 <= s.length <= 10000`\n- `s` may contain letters, digits, spaces, and printable punctuation.\n- Only characters in the range `A`–`Z` count as uppercase.',
    difficulty: 'easy',
    tags: ['strings'],
    companies: ['Acme', 'Hooli'],
    functionName: 'countUppercase',
    ioSpec: {
      params: [
        {
          name: 's',
          type: 'string',
        },
      ],
      returns: 'int',
    },
    referenceSolution: {
      python: "def countUppercase(s):\n    return sum(1 for c in s if 'A' <= c <= 'Z')\n",
      javascript:
        "function countUppercase(s) {\n    let count = 0;\n    for (const c of s) {\n        if (c >= 'A' && c <= 'Z') count++;\n    }\n    return count;\n}\n",
    },
    starterCode: {
      python:
        'def countUppercase(s):\n    # TODO: return the number of uppercase English letters (A-Z) in s\n    pass\n',
      javascript:
        'function countUppercase(s) {\n    // TODO: return the number of uppercase English letters (A-Z) in s\n}\n',
    },
    sampleTestcases: [
      {
        inputs: ['Hello World'],
        expected: 2,
        explanation: 'H and W are uppercase.',
      },
      {
        inputs: ['CodeStack Rocks 2026'],
        expected: 3,
        explanation: 'C, S, and R are uppercase; digits and spaces do not count.',
      },
    ],
    hiddenTestcases: [
      {
        inputs: [''],
        expected: 0,
        explanation: 'Empty string has no letters.',
      },
      {
        inputs: ['A'],
        expected: 1,
        explanation: 'Single uppercase letter.',
      },
      {
        inputs: ['abcdef'],
        expected: 0,
        explanation: 'All lowercase, none count.',
      },
      {
        inputs: ['ABCDEF'],
        expected: 6,
        explanation: 'All six letters are uppercase.',
      },
      {
        inputs: ['aAbBcC123!@#'],
        expected: 3,
        explanation: 'Only A, B, C are uppercase; digits and symbols are ignored.',
      },
      {
        inputs: ['The Quick Brown Fox Jumps Over The Lazy Dog'],
        expected: 9,
        explanation: 'Each of the nine words starts with an uppercase letter.',
      },
      {
        inputs: ['ZzZzZ'],
        expected: 3,
        explanation: 'The uppercase Z appears three times among duplicates.',
      },
      {
        inputs: ['HELLO, my NAME is CLAUDE'],
        expected: 15,
        explanation: 'HELLO (5) + NAME (4) + CLAUDE (6) = 15 uppercase letters.',
      },
    ],
  },
  {
    slug: 'product-of-array',
    title: 'Product of Array',
    statementMarkdown:
      'A signal conveyor multiplies its input gain stage by stage. Given a list `nums` of integer gain factors, return the **total gain**, which is the product of every value in `nums`. If `nums` is empty, the conveyor applies no change, so the product is defined as `1`.\n\nBecause the running product can grow well past the 32-bit range, the answer is returned as a 64-bit value.\n\n## Examples\n\n### Example 1\n- Input: `nums = [2, 3, 4]`\n- Output: `24`\n- Explanation: 2 x 3 x 4 = 24.\n\n### Example 2\n- Input: `nums = []`\n- Output: `1`\n- Explanation: With no factors, the product of an empty list is defined as 1.\n\n## Constraints\n- `0 <= nums.length <= 1000`\n- `-1000 <= nums[i] <= 1000`\n- For every test case, the product of all elements fits in a signed 64-bit integer.',
    difficulty: 'easy',
    tags: ['arrays', 'math'],
    companies: ['Globex', 'Initech'],
    functionName: 'productOfArray',
    ioSpec: {
      params: [
        {
          name: 'nums',
          type: {
            array: 'int',
          },
        },
      ],
      returns: 'long',
    },
    referenceSolution: {
      python:
        'def productOfArray(nums):\n    result = 1\n    for x in nums:\n        result *= x\n    return result\n',
      javascript:
        'function productOfArray(nums) {\n    let result = 1;\n    for (const x of nums) {\n        result *= x;\n    }\n    return result;\n}\n',
    },
    starterCode: {
      python:
        'def productOfArray(nums):\n    # TODO: return the product of all elements in nums (an empty list -> 1)\n    pass\n',
      javascript:
        'function productOfArray(nums) {\n    // TODO: return the product of all elements in nums (an empty list -> 1)\n}\n',
    },
    sampleTestcases: [
      {
        inputs: [[2, 3, 4]],
        expected: 24,
        explanation: '2 x 3 x 4 = 24.',
      },
      {
        inputs: [[]],
        expected: 1,
        explanation: 'The product of an empty list is 1.',
      },
    ],
    hiddenTestcases: [
      {
        inputs: [[]],
        expected: 1,
        explanation: 'Empty array returns the identity value 1.',
      },
      {
        inputs: [[7]],
        expected: 7,
        explanation: 'Single element is its own product.',
      },
      {
        inputs: [[-6]],
        expected: -6,
        explanation: 'Single negative element.',
      },
      {
        inputs: [[-2, 3, -4]],
        expected: 24,
        explanation: '-2 x 3 x -4 = 24; an even count of negatives yields a positive product.',
      },
      {
        inputs: [[5, 0, 9]],
        expected: 0,
        explanation: 'A zero factor makes the whole product 0.',
      },
      {
        inputs: [[3, 3, 3]],
        expected: 27,
        explanation: 'All-same elements: 3^3 = 27.',
      },
      {
        inputs: [[2, 2, 5, 5]],
        expected: 100,
        explanation: 'Duplicates: 2 x 2 x 5 x 5 = 100.',
      },
      {
        inputs: [[1000, 1000, 1000, 1000, 1000]],
        expected: 1000000000000000,
        explanation:
          'Larger case: 1000^5 = 1,000,000,000,000,000, which exceeds 32-bit range and needs a 64-bit result.',
      },
    ],
  },
  {
    slug: 'count-positive-numbers',
    title: 'Count Positive Numbers',
    statementMarkdown:
      '## Count Positive Numbers\n\nA quality-control script at a warehouse logs the daily change in stock for each item as an integer in `nums`. A positive value means more units arrived than left that day, a negative value means the opposite, and `0` means no net change. Given `nums`, return how many entries are **strictly greater than** `0`.\n\nZeros and negative values do not count.\n\n### Examples\n\n**Example 1**\n\n- Input: `nums = [3, -1, 0, 7, -2]`\n- Output: `2`\n- Explanation: Only `3` and `7` are greater than `0`, so the count is `2`.\n\n**Example 2**\n\n- Input: `nums = [-4, -9, -1]`\n- Output: `0`\n- Explanation: Every value is negative, so no element is positive.\n\n### Constraints\n\n- `0 <= nums.length <= 10000`\n- `-2147483648 <= nums[i] <= 2147483647`\n- The answer is a single integer between `0` and `nums.length`.',
    difficulty: 'easy',
    tags: ['arrays'],
    companies: ['Globex'],
    functionName: 'countPositive',
    ioSpec: {
      params: [
        {
          name: 'nums',
          type: {
            array: 'int',
          },
        },
      ],
      returns: 'int',
    },
    referenceSolution: {
      python:
        'def countPositive(nums):\n    count = 0\n    for x in nums:\n        if x > 0:\n            count += 1\n    return count\n',
      javascript:
        'function countPositive(nums) {\n    let count = 0;\n    for (const x of nums) {\n        if (x > 0) {\n            count++;\n        }\n    }\n    return count;\n}\n',
    },
    starterCode: {
      python:
        'def countPositive(nums):\n    # TODO: return how many elements of nums are strictly greater than 0\n    pass\n',
      javascript:
        'function countPositive(nums) {\n    // TODO: return how many elements of nums are strictly greater than 0\n}\n',
    },
    sampleTestcases: [
      {
        inputs: [[3, -1, 0, 7, -2]],
        expected: 2,
        explanation: '3 and 7 are greater than 0.',
      },
      {
        inputs: [[-4, -9, -1]],
        expected: 0,
        explanation: 'No element is positive.',
      },
    ],
    hiddenTestcases: [
      {
        inputs: [[]],
        expected: 0,
        explanation: 'Empty array has no positive elements.',
      },
      {
        inputs: [[8]],
        expected: 1,
        explanation: 'Single positive element.',
      },
      {
        inputs: [[-7]],
        expected: 0,
        explanation: 'Single negative element.',
      },
      {
        inputs: [[0, 0, 0]],
        expected: 0,
        explanation: 'Zero is not strictly positive.',
      },
      {
        inputs: [[-2, -1, -100]],
        expected: 0,
        explanation: 'All values negative.',
      },
      {
        inputs: [[5, 5, 5, 5, 5]],
        expected: 5,
        explanation: 'All identical positive values counted.',
      },
      {
        inputs: [[-10, 0, 6, -1, 9, 0, 2, 2]],
        expected: 4,
        explanation: 'Positives are 6, 9, 2, 2.',
      },
      {
        inputs: [[2147483647, -2147483648, 0, 1, -1, 100, 100]],
        expected: 4,
        explanation: 'Positives are 2147483647, 1, 100, 100 (boundary values included).',
      },
    ],
  },
  {
    slug: 'array-range-spread',
    title: 'Array Range Spread',
    statementMarkdown:
      'A weather station records a series of temperature readings for the day and wants to know how volatile the day was. The volatility is defined as the gap between the warmest and the coldest reading.\n\nGiven an integer array `nums` containing at least one reading, return the **range spread**: the largest value in `nums` minus the smallest value in `nums`. If `nums` has only one element, its spread is `0` (the single value is both the max and the min).\n\n## Examples\n\n### Example 1\n- Input: `nums = [4, 1, 7, 3]`\n- Output: `6`\n- Explanation: The maximum is `7` and the minimum is `1`, so the spread is `7 - 1 = 6`.\n\n### Example 2\n- Input: `nums = [5]`\n- Output: `0`\n- Explanation: With one reading, the max and the min are both `5`, so the spread is `5 - 5 = 0`.\n\n## Constraints\n- `1 <= nums.length <= 10^4`\n- `-10^9 <= nums[i] <= 10^9`\n- The returned spread always fits in a 32-bit signed integer.',
    difficulty: 'easy',
    tags: ['arrays'],
    companies: ['Acme', 'Hooli'],
    functionName: 'rangeSpread',
    ioSpec: {
      params: [
        {
          name: 'nums',
          type: {
            array: 'int',
          },
        },
      ],
      returns: 'int',
    },
    referenceSolution: {
      python: 'def rangeSpread(nums):\n    return max(nums) - min(nums)\n',
      javascript:
        'function rangeSpread(nums) {\n    let mn = nums[0], mx = nums[0];\n    for (let i = 1; i < nums.length; i++) {\n        if (nums[i] < mn) mn = nums[i];\n        if (nums[i] > mx) mx = nums[i];\n    }\n    return mx - mn;\n}\n',
    },
    starterCode: {
      python:
        'def rangeSpread(nums):\n    # TODO: return (max of nums) - (min of nums)\n    pass\n',
      javascript:
        'function rangeSpread(nums) {\n    // TODO: return (max of nums) - (min of nums)\n}\n',
    },
    sampleTestcases: [
      {
        inputs: [[4, 1, 7, 3]],
        expected: 6,
        explanation: 'max 7 minus min 1 equals 6.',
      },
      {
        inputs: [[5]],
        expected: 0,
        explanation: 'A single reading has spread 0.',
      },
    ],
    hiddenTestcases: [
      {
        inputs: [[10]],
        expected: 0,
        explanation: 'Single element: max and min are both 10.',
      },
      {
        inputs: [[3, 3, 3, 3]],
        expected: 0,
        explanation: 'All values equal, so spread is 0.',
      },
      {
        inputs: [[-5, -1, -9, -3]],
        expected: 8,
        explanation: 'max -1 minus min -9 equals 8.',
      },
      {
        inputs: [[-2, 4, -6, 8]],
        expected: 14,
        explanation: 'max 8 minus min -6 equals 14.',
      },
      {
        inputs: [[100, -100]],
        expected: 200,
        explanation: 'max 100 minus min -100 equals 200.',
      },
      {
        inputs: [[7, 7, 2, 9, 2]],
        expected: 7,
        explanation: 'max 9 minus min 2 equals 7, duplicates ignored.',
      },
      {
        inputs: [[1000000000, -1000000000]],
        expected: 2000000000,
        explanation: 'Boundary values: spread 2000000000 still fits in a 32-bit int.',
      },
      {
        inputs: [[0, 0, 0]],
        expected: 0,
        explanation: 'All zeros give spread 0.',
      },
    ],
  },
  {
    slug: 'toggle-letter-case',
    title: 'Toggle Letter Case',
    statementMarkdown:
      'A label printer at a warehouse needs to "invert" the casing of every product code it prints: every capital letter should come out small, and every small letter should come out capital. Digits, spaces, and punctuation must be printed exactly as they were.\n\nGiven a string `s`, return a new string in which every uppercase English letter (`A`-`Z`) is converted to lowercase and every lowercase English letter (`a`-`z`) is converted to uppercase. All characters that are not English letters are left unchanged, and the overall order of characters is preserved.\n\n## Examples\n\n**Example 1**\n\n- Input: `s = "Hello, World!"`\n- Output: `"hELLO, wORLD!"`\n- Explanation: `H` becomes `h`, `e` becomes `E`, and so on. The comma, space, and exclamation mark stay where they are.\n\n**Example 2**\n\n- Input: `s = "abcXYZ"`\n- Output: `"ABCxyz"`\n- Explanation: The three lowercase letters become uppercase and the three uppercase letters become lowercase.\n\n## Constraints\n\n- `0 <= s.length <= 10000`\n- `s` consists of printable ASCII characters (letters, digits, spaces, and punctuation).\n- Only the English letters `A`-`Z` and `a`-`z` change case; every other character is copied unchanged.',
    difficulty: 'easy',
    tags: ['strings'],
    companies: ['Hooli', 'Initech'],
    functionName: 'toggleCase',
    ioSpec: {
      params: [
        {
          name: 's',
          type: 'string',
        },
      ],
      returns: 'string',
    },
    referenceSolution: {
      python:
        "def toggleCase(s):\n    result = []\n    for ch in s:\n        if 'a' <= ch <= 'z':\n            result.append(chr(ord(ch) - 32))\n        elif 'A' <= ch <= 'Z':\n            result.append(chr(ord(ch) + 32))\n        else:\n            result.append(ch)\n    return ''.join(result)\n",
      javascript:
        "function toggleCase(s) {\n    let result = '';\n    for (const ch of s) {\n        if (ch >= 'a' && ch <= 'z') {\n            result += String.fromCharCode(ch.charCodeAt(0) - 32);\n        } else if (ch >= 'A' && ch <= 'Z') {\n            result += String.fromCharCode(ch.charCodeAt(0) + 32);\n        } else {\n            result += ch;\n        }\n    }\n    return result;\n}\n",
    },
    starterCode: {
      python:
        'def toggleCase(s):\n    # TODO: return a new string with the case of every English letter flipped,\n    # leaving all non-letter characters unchanged.\n    pass\n',
      javascript:
        'function toggleCase(s) {\n    // TODO: return a new string with the case of every English letter flipped,\n    // leaving all non-letter characters unchanged.\n}\n',
    },
    sampleTestcases: [
      {
        inputs: ['Hello, World!'],
        expected: 'hELLO, wORLD!',
        explanation: "Each letter flips case; comma, space, and '!' are unchanged.",
      },
      {
        inputs: ['abcXYZ'],
        expected: 'ABCxyz',
        explanation: 'Lowercase letters become uppercase and vice versa.',
      },
    ],
    hiddenTestcases: [
      {
        inputs: [''],
        expected: '',
        explanation: 'Empty string yields an empty string.',
      },
      {
        inputs: ['z'],
        expected: 'Z',
        explanation: 'Single lowercase letter becomes uppercase.',
      },
      {
        inputs: ['123 456'],
        expected: '123 456',
        explanation: 'No letters present, so nothing changes.',
      },
      {
        inputs: ['AAAA'],
        expected: 'aaaa',
        explanation: 'All identical uppercase letters become lowercase.',
      },
      {
        inputs: ['_a_B_'],
        expected: '_A_b_',
        explanation: 'Underscores stay put while the two letters flip case.',
      },
      {
        inputs: ['aA'],
        expected: 'Aa',
        explanation: 'Adjacent lowercase and uppercase letters swap.',
      },
      {
        inputs: ['MixedCase 42!'],
        expected: 'mIXEDcASE 42!',
        explanation: 'Mix of cases, a digit run, and punctuation.',
      },
      {
        inputs: ['The Quick Brown Fox JUMPS over 13 lazy Dogs.'],
        expected: 'tHE qUICK bROWN fOX jumps OVER 13 LAZY dOGS.',
        explanation: 'Larger sentence with words, an all-caps word, digits, and a period.',
      },
    ],
  },
  {
    slug: 'count-above-threshold',
    title: 'Count Above Threshold',
    statementMarkdown:
      'A weather station logs a list of temperature readings and wants to know how many of them cross a warning line.\n\nGiven an integer array `nums` and an integer `threshold`, return the number of elements in `nums` that are **strictly greater than** `threshold`. An element equal to `threshold` does not count.\n\n## Examples\n\n**Example 1**\n\n- Input: `nums = [1, 5, 3, 8, 2]`, `threshold = 3`\n- Output: `2`\n- Explanation: Only `5` and `8` are strictly greater than `3`. The value `3` itself is not counted.\n\n**Example 2**\n\n- Input: `nums = [10, 20, 30]`, `threshold = 25`\n- Output: `1`\n- Explanation: Only `30` exceeds `25`.\n\n## Constraints\n\n- `0 <= nums.length <= 10^5`\n- `-10^9 <= nums[i] <= 10^9`\n- `-10^9 <= threshold <= 10^9`\n- Comparison is strict: values equal to `threshold` are excluded.',
    difficulty: 'easy',
    tags: ['arrays'],
    companies: ['Acme', 'Globex'],
    functionName: 'countAboveThreshold',
    ioSpec: {
      params: [
        {
          name: 'nums',
          type: {
            array: 'int',
          },
        },
        {
          name: 'threshold',
          type: 'int',
        },
      ],
      returns: 'int',
    },
    referenceSolution: {
      python:
        'def countAboveThreshold(nums, threshold):\n    count = 0\n    for x in nums:\n        if x > threshold:\n            count += 1\n    return count\n',
      javascript:
        'function countAboveThreshold(nums, threshold) {\n    let count = 0;\n    for (const x of nums) {\n        if (x > threshold) {\n            count += 1;\n        }\n    }\n    return count;\n}\n',
    },
    starterCode: {
      python:
        'def countAboveThreshold(nums, threshold):\n    # TODO: return how many elements of nums are strictly greater than threshold\n    pass\n',
      javascript:
        'function countAboveThreshold(nums, threshold) {\n    // TODO: return how many elements of nums are strictly greater than threshold\n}\n',
    },
    sampleTestcases: [
      {
        inputs: [[1, 5, 3, 8, 2], 3],
        expected: 2,
        explanation: '5 and 8 are strictly greater than 3.',
      },
      {
        inputs: [[10, 20, 30], 25],
        expected: 1,
        explanation: 'Only 30 exceeds 25.',
      },
    ],
    hiddenTestcases: [
      {
        inputs: [[], 0],
        expected: 0,
        explanation: 'Empty array has no elements.',
      },
      {
        inputs: [[7], 3],
        expected: 1,
        explanation: 'Single element 7 is greater than 3.',
      },
      {
        inputs: [[5], 5],
        expected: 0,
        explanation: 'Element equal to threshold is not counted.',
      },
      {
        inputs: [[-5, -1, 0, -3, 2], -2],
        expected: 3,
        explanation: '-1, 0, and 2 are greater than -2.',
      },
      {
        inputs: [[4, 4, 4, 4], 4],
        expected: 0,
        explanation: 'All values equal the threshold, so none count.',
      },
      {
        inputs: [[2, 2, 5, 5, 1], 2],
        expected: 2,
        explanation: 'The two 5s exceed 2; the 2s and 1 do not.',
      },
      {
        inputs: [[1000000000, -1000000000, 0, 500, 500], 499],
        expected: 3,
        explanation: '1000000000 and both 500s exceed 499.',
      },
      {
        inputs: [[3, 1, 4, 1, 5, 9, 2, 6, 5, 3, 5], 4],
        expected: 5,
        explanation: '5, 9, 6, 5, and 5 are strictly greater than 4.',
      },
    ],
  },
  {
    slug: 'reverse-word-order',
    title: 'Reverse Word Order',
    statementMarkdown:
      'Given a string `s` containing words separated by exactly one space, return a new string with the order of the words reversed.\n\nThe words themselves are left unchanged — only their order flips. There are no leading or trailing spaces in `s`, and consecutive words are always separated by a single space. If `s` is empty, return an empty string.\n\n## Examples\n\n**Example 1**\n\n- Input: `s = "read the docs"`\n- Output: `"docs the read"`\n- Explanation: The three words are reordered from last to first while each word stays intact.\n\n**Example 2**\n\n- Input: `s = "ship"`\n- Output: `"ship"`\n- Explanation: A single word has nothing to swap, so the result is unchanged.\n\n## Constraints\n\n- `0 <= len(s) <= 10000`\n- `s` contains only printable ASCII characters, with no leading or trailing spaces.\n- Words in `s` are separated by exactly one space.\n- An empty string maps to an empty string.',
    difficulty: 'easy',
    tags: ['strings'],
    companies: ['Globex', 'Hooli'],
    functionName: 'reverseWordOrder',
    ioSpec: {
      params: [
        {
          name: 's',
          type: 'string',
        },
      ],
      returns: 'string',
    },
    referenceSolution: {
      python:
        'def reverseWordOrder(s):\n    if s == "":\n        return ""\n    words = s.split(" ")\n    words.reverse()\n    return " ".join(words)\n',
      javascript:
        'function reverseWordOrder(s) {\n  if (s === "") return "";\n  return s.split(" ").reverse().join(" ");\n}\n',
    },
    starterCode: {
      python:
        'def reverseWordOrder(s):\n    # TODO: reverse the order of the words in s and return the result\n    pass\n',
      javascript:
        'function reverseWordOrder(s) {\n  // TODO: reverse the order of the words in s and return the result\n}\n',
    },
    sampleTestcases: [
      {
        inputs: ['read the docs'],
        expected: 'docs the read',
        explanation: 'The three words are reordered from last to first.',
      },
      {
        inputs: ['the quick brown fox'],
        expected: 'fox brown quick the',
        explanation: 'Four words reversed in order.',
      },
    ],
    hiddenTestcases: [
      {
        inputs: [''],
        expected: '',
        explanation: 'Empty string maps to empty string.',
      },
      {
        inputs: ['single'],
        expected: 'single',
        explanation: 'A single word is unchanged.',
      },
      {
        inputs: ['a b c d e'],
        expected: 'e d c b a',
        explanation: 'Five single-letter words reversed.',
      },
      {
        inputs: ['go go go'],
        expected: 'go go go',
        explanation: 'All words identical, so the reversed order looks the same.',
      },
      {
        inputs: ['code stack rocks'],
        expected: 'rocks stack code',
        explanation: 'Three words reversed.',
      },
      {
        inputs: ['abc 123 xyz'],
        expected: 'xyz 123 abc',
        explanation: 'Digit words are treated like any other token.',
      },
      {
        inputs: ['one two three four five six seven eight'],
        expected: 'eight seven six five four three two one',
        explanation: 'Larger case with eight words fully reversed.',
      },
    ],
  },
  {
    slug: 'are-all-even',
    title: 'Are All Even',
    statementMarkdown:
      'You are running a nightly integrity check on a fleet of sensors. Each sensor reports an integer reading, and the batch is considered "balanced" only when every reading is an even number.\n\nGiven an array `nums`, return `true` if every element is even (that is, divisible by 2), and `false` otherwise. An empty array is considered balanced, so it should return `true`.\n\n## Examples\n\n### Example 1\n- Input: `nums = [2, 4, 6, 8]`\n- Output: `true`\n- Explanation: Every value is divisible by 2, so the batch is balanced.\n\n### Example 2\n- Input: `nums = [1, 2, 3]`\n- Output: `false`\n- Explanation: `1` and `3` are odd, so not every value is even.\n\n## Constraints\n- `0 <= nums.length <= 10000`\n- `-1000000 <= nums[i] <= 1000000`\n- An empty `nums` returns `true`.',
    difficulty: 'easy',
    tags: ['arrays'],
    companies: ['Acme', 'Initech'],
    functionName: 'areAllEven',
    ioSpec: {
      params: [
        {
          name: 'nums',
          type: {
            array: 'int',
          },
        },
      ],
      returns: 'bool',
    },
    referenceSolution: {
      python: 'def areAllEven(nums):\n    return all(n % 2 == 0 for n in nums)\n',
      javascript: 'function areAllEven(nums) {\n  return nums.every(n => n % 2 === 0);\n}\n',
    },
    starterCode: {
      python:
        'def areAllEven(nums):\n    # TODO: return True if every element of nums is even, else False.\n    # An empty array should return True.\n    pass\n',
      javascript:
        'function areAllEven(nums) {\n  // TODO: return true if every element of nums is even, else false.\n  // An empty array should return true.\n}\n',
    },
    sampleTestcases: [
      {
        inputs: [[2, 4, 6, 8]],
        expected: true,
        explanation: 'All four values are divisible by 2.',
      },
      {
        inputs: [[1, 2, 3]],
        expected: false,
        explanation: '1 and 3 are odd.',
      },
    ],
    hiddenTestcases: [
      {
        inputs: [[]],
        expected: true,
        explanation: 'Empty array is considered balanced.',
      },
      {
        inputs: [[0]],
        expected: true,
        explanation: 'Zero is even.',
      },
      {
        inputs: [[7]],
        expected: false,
        explanation: 'Single odd value.',
      },
      {
        inputs: [[-2, -4, -6, -8]],
        expected: true,
        explanation: 'Negative even values are still even.',
      },
      {
        inputs: [[-3, -2, -1]],
        expected: false,
        explanation: '-3 and -1 are odd.',
      },
      {
        inputs: [[100, 100, 100]],
        expected: true,
        explanation: 'All identical even values.',
      },
      {
        inputs: [[2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30, 32, 34, 36, 38, 41]],
        expected: false,
        explanation: 'A single odd value (41) at the end forces a full scan.',
      },
      {
        inputs: [[2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30, 32, 34, 36, 38, 40]],
        expected: true,
        explanation: 'Larger all-even batch.',
      },
    ],
  },
  {
    slug: 'is-power-of-two',
    title: 'Power of Two Check',
    statementMarkdown:
      '## Power of Two Check\n\nA signal counter at a data center only reports valid readings when the count is an exact power of two (that is, one of `1, 2, 4, 8, 16, ...`). Given a single integer `n`, determine whether it is a positive power of two.\n\nReturn `true` if `n` can be written as `2^k` for some integer `k >= 0`, and `false` otherwise. Note that zero and all negative numbers are never powers of two.\n\n### Examples\n\n**Example 1**\n- Input: `n = 8`\n- Output: `true`\n- Explanation: `8 = 2^3`, so it is a power of two.\n\n**Example 2**\n- Input: `n = 6`\n- Output: `false`\n- Explanation: `6 = 2 * 3`. It is not a power of two because it has an odd factor greater than one.\n\n### Constraints\n\n- `-1000000000 <= n <= 1000000000`\n- `n` is a single 32-bit integer.\n- Exactly `2^0 = 1` is the smallest valid power of two; `0` and negatives return `false`.',
    difficulty: 'easy',
    tags: ['bit-manipulation', 'math'],
    companies: ['Acme', 'Hooli'],
    functionName: 'isPowerOfTwo',
    ioSpec: {
      params: [
        {
          name: 'n',
          type: 'int',
        },
      ],
      returns: 'bool',
    },
    referenceSolution: {
      python: 'def isPowerOfTwo(n):\n    return n > 0 and (n & (n - 1)) == 0\n',
      javascript: 'function isPowerOfTwo(n) {\n    return n > 0 && (n & (n - 1)) === 0;\n}\n',
    },
    starterCode: {
      python:
        'def isPowerOfTwo(n):\n    # TODO: return True if n is a positive power of two, else False\n    pass\n',
      javascript:
        'function isPowerOfTwo(n) {\n    // TODO: return true if n is a positive power of two, else false\n}\n',
    },
    sampleTestcases: [
      {
        inputs: [8],
        expected: true,
        explanation: '8 = 2^3 is a power of two.',
      },
      {
        inputs: [6],
        expected: false,
        explanation: '6 = 2 * 3 has an odd factor, so it is not a power of two.',
      },
    ],
    hiddenTestcases: [
      {
        inputs: [1],
        expected: true,
        explanation: '1 = 2^0, the smallest power of two.',
      },
      {
        inputs: [2],
        expected: true,
        explanation: '2 = 2^1.',
      },
      {
        inputs: [3],
        expected: false,
        explanation: '3 is odd and greater than 1.',
      },
      {
        inputs: [0],
        expected: false,
        explanation: 'Zero is not positive, so it is not a power of two.',
      },
      {
        inputs: [-16],
        expected: false,
        explanation: 'Negative numbers are never powers of two even though 16 is.',
      },
      {
        inputs: [1024],
        expected: true,
        explanation: '1024 = 2^10.',
      },
      {
        inputs: [1073741824],
        expected: true,
        explanation: '1073741824 = 2^30, a large valid power of two.',
      },
      {
        inputs: [1000000000],
        expected: false,
        explanation: 'One billion is not a power of two.',
      },
    ],
  },
  {
    slug: 'remove-vowels',
    title: 'Remove Vowels',
    statementMarkdown:
      '## Remove Vowels\n\nA text editor at Globex has a "declutter" feature that strips every English vowel out of a snippet while leaving all other characters untouched.\n\nGiven a string `s`, return a new string that contains every character of `s` in its original order, except that all English vowels are removed. A vowel is any of the letters `a`, `e`, `i`, `o`, `u`, in either lowercase or uppercase. Every other character — consonants, digits, spaces, punctuation, and symbols — is kept exactly as it appears.\n\nNote that the letter `y` is **not** treated as a vowel.\n\n### Examples\n\n**Example 1**\n\n- Input: `s = "Codestack"`\n- Output: `"Cdstck"`\n- Explanation: The vowels `o`, `e`, and `a` are removed; the remaining letters stay in order.\n\n**Example 2**\n\n- Input: `s = "Hello, World!"`\n- Output: `"Hll, Wrld!"`\n- Explanation: The vowels `e`, `o`, and `o` are dropped. The comma, space, and exclamation mark are preserved.\n\n### Constraints\n\n- `0 <= s.length <= 10000`\n- `s` consists of printable ASCII characters (letters, digits, spaces, and punctuation).\n- The comparison for vowels is case-insensitive: both `a` and `A` are removed.',
    difficulty: 'easy',
    tags: ['strings'],
    companies: ['Globex'],
    functionName: 'removeVowels',
    ioSpec: {
      params: [
        {
          name: 's',
          type: 'string',
        },
      ],
      returns: 'string',
    },
    referenceSolution: {
      python:
        'def removeVowels(s):\n    vowels = set("aeiouAEIOU")\n    return "".join(c for c in s if c not in vowels)\n',
      javascript:
        "function removeVowels(s) {\n  const vowels = new Set(['a', 'e', 'i', 'o', 'u', 'A', 'E', 'I', 'O', 'U']);\n  let result = \"\";\n  for (const c of s) {\n    if (!vowels.has(c)) result += c;\n  }\n  return result;\n}\n",
    },
    starterCode: {
      python:
        'def removeVowels(s):\n    # TODO: return s with every English vowel (a, e, i, o, u; both cases) removed,\n    # keeping all other characters in their original order.\n    pass\n',
      javascript:
        'function removeVowels(s) {\n  // TODO: return s with every English vowel (a, e, i, o, u; both cases) removed,\n  // keeping all other characters in their original order.\n}\n',
    },
    sampleTestcases: [
      {
        inputs: ['Codestack'],
        expected: 'Cdstck',
        explanation: 'Vowels o, e, a are removed.',
      },
      {
        inputs: ['Hello, World!'],
        expected: 'Hll, Wrld!',
        explanation: 'Vowels e, o, o are removed; punctuation and spaces stay.',
      },
    ],
    hiddenTestcases: [
      {
        inputs: [''],
        expected: '',
        explanation: 'Empty input yields empty output.',
      },
      {
        inputs: ['aeiouAEIOU'],
        expected: '',
        explanation: 'A string made entirely of vowels becomes empty.',
      },
      {
        inputs: ['rhythm'],
        expected: 'rhythm',
        explanation: 'No aeiou vowels present; y is not a vowel, so nothing is removed.',
      },
      {
        inputs: ['A'],
        expected: '',
        explanation: 'A single uppercase vowel is removed.',
      },
      {
        inputs: ['12345!@#'],
        expected: '12345!@#',
        explanation: 'Digits and symbols are never removed.',
      },
      {
        inputs: ['The quick brown fox'],
        expected: 'Th qck brwn fx',
        explanation: 'Vowels e, u, i, o, o removed; spaces preserved.',
      },
      {
        inputs: ['Rhythm and Blues'],
        expected: 'Rhythm nd Bls',
        explanation: 'Only a, u, e are removed; y stays as a consonant.',
      },
      {
        inputs: ['Programming'],
        expected: 'Prgrmmng',
        explanation: 'Vowels o, a, i removed, including a repeated consonant m kept intact.',
      },
    ],
  },
  {
    slug: 'longest-equal-run',
    title: 'Longest Equal Run',
    statementMarkdown:
      'A telemetry sensor logs a reading every second into an array `nums`. Maintenance engineers want to know the longest stretch during which the reading never changed, because a flat stretch signals the sensor may be stuck.\n\nGiven the integer array `nums`, return the length of the longest run of consecutive equal elements. A "run" is a maximal block of positions where every value equals its neighbor. If `nums` is empty, return `0`.\n\n## Examples\n\nInput: `nums = [4, 4, 4, 2, 2]`\nOutput: `3`\nExplanation: The block `4, 4, 4` has length 3 and the block `2, 2` has length 2, so the longest run is 3.\n\nInput: `nums = [1, 2, 3, 4, 5]`\nOutput: `1`\nExplanation: No two adjacent values are equal, so every run has length 1.\n\n## Constraints\n\n- `0 <= nums.length <= 100000`\n- `-1000000000 <= nums[i] <= 1000000000`\n- Return `0` when `nums` is empty.',
    difficulty: 'easy',
    tags: ['arrays'],
    companies: ['Globex', 'Initech'],
    functionName: 'longestEqualRun',
    ioSpec: {
      params: [
        {
          name: 'nums',
          type: {
            array: 'int',
          },
        },
      ],
      returns: 'int',
    },
    referenceSolution: {
      python:
        'def longestEqualRun(nums):\n    if not nums:\n        return 0\n    best = 1\n    cur = 1\n    for i in range(1, len(nums)):\n        if nums[i] == nums[i - 1]:\n            cur += 1\n            if cur > best:\n                best = cur\n        else:\n            cur = 1\n    return best\n',
      javascript:
        'function longestEqualRun(nums) {\n    if (nums.length === 0) return 0;\n    let best = 1;\n    let cur = 1;\n    for (let i = 1; i < nums.length; i++) {\n        if (nums[i] === nums[i - 1]) {\n            cur += 1;\n            if (cur > best) best = cur;\n        } else {\n            cur = 1;\n        }\n    }\n    return best;\n}\n',
    },
    starterCode: {
      python:
        'def longestEqualRun(nums):\n    # TODO: return the length of the longest run of consecutive equal elements.\n    pass\n',
      javascript:
        'function longestEqualRun(nums) {\n    // TODO: return the length of the longest run of consecutive equal elements.\n}\n',
    },
    sampleTestcases: [
      {
        inputs: [[4, 4, 4, 2, 2]],
        expected: 3,
        explanation: 'The run 4,4,4 has length 3, longer than the run 2,2.',
      },
      {
        inputs: [[7]],
        expected: 1,
        explanation: 'A single element forms a run of length 1.',
      },
    ],
    hiddenTestcases: [
      {
        inputs: [[]],
        expected: 0,
        explanation: 'Empty array returns 0.',
      },
      {
        inputs: [[5, 5, 5, 5, 5]],
        expected: 5,
        explanation: 'All elements equal, so the whole array is one run.',
      },
      {
        inputs: [[1, 2, 3, 4, 5]],
        expected: 1,
        explanation: 'No adjacent equal values, every run has length 1.',
      },
      {
        inputs: [[-1, -1, 3, 3, 3, -1]],
        expected: 3,
        explanation: 'The middle block 3,3,3 is the longest run; negatives are handled normally.',
      },
      {
        inputs: [[2, 2, 1, 1, 1, 1, 3]],
        expected: 4,
        explanation: 'The block 1,1,1,1 has length 4.',
      },
      {
        inputs: [[9, 9, 9, 1, 9, 9]],
        expected: 3,
        explanation:
          'The leading 9,9,9 run beats the later 9,9 run since runs must be consecutive.',
      },
      {
        inputs: [[0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 2, 2]],
        expected: 10,
        explanation: 'The block of ten 1s is the longest run in this larger case.',
      },
    ],
  },
  {
    slug: 'count-divisors',
    title: 'Count Divisors',
    statementMarkdown:
      '## Count Divisors\n\nA librarian is arranging `n` identical books into equal-sized shelves and wants to know how many different shelf sizes leave no book unshelved. That count is exactly the number of positive integers that divide `n` evenly.\n\nGiven a positive integer `n`, return the number of positive integers `d` such that `n` is divisible by `d` (that is, `n % d == 0`).\n\n### Examples\n\n**Example 1**\n\n- Input: `n = 12`\n- Output: `6`\n- Explanation: The positive divisors of `12` are `{1, 2, 3, 4, 6, 12}`, so the answer is `6`.\n\n**Example 2**\n\n- Input: `n = 7`\n- Output: `2`\n- Explanation: `7` is prime, so its only divisors are `{1, 7}`, giving `2`.\n\n### Constraints\n\n- `1 <= n <= 1000000`\n- The answer counts every positive divisor from `1` up to `n` inclusive.',
    difficulty: 'easy',
    tags: ['math'],
    companies: ['Acme', 'Hooli'],
    functionName: 'countDivisors',
    ioSpec: {
      params: [
        {
          name: 'n',
          type: 'int',
        },
      ],
      returns: 'int',
    },
    referenceSolution: {
      python:
        'def countDivisors(n):\n    count = 0\n    i = 1\n    while i * i <= n:\n        if n % i == 0:\n            if i == n // i:\n                count += 1\n            else:\n                count += 2\n        i += 1\n    return count\n',
      javascript:
        'function countDivisors(n) {\n    let count = 0;\n    for (let i = 1; i * i <= n; i++) {\n        if (n % i === 0) {\n            if (i === n / i) {\n                count += 1;\n            } else {\n                count += 2;\n            }\n        }\n    }\n    return count;\n}\n',
    },
    starterCode: {
      python:
        'def countDivisors(n):\n    # TODO: return the number of positive integers that divide n evenly\n    pass\n',
      javascript:
        'function countDivisors(n) {\n    // TODO: return the number of positive integers that divide n evenly\n}\n',
    },
    sampleTestcases: [
      {
        inputs: [12],
        expected: 6,
        explanation: 'Divisors of 12 are {1,2,3,4,6,12}.',
      },
      {
        inputs: [1],
        expected: 1,
        explanation: '1 has only itself as a divisor.',
      },
    ],
    hiddenTestcases: [
      {
        inputs: [2],
        expected: 2,
        explanation: 'Smallest prime: {1,2}.',
      },
      {
        inputs: [7],
        expected: 2,
        explanation: 'Prime: {1,7}.',
      },
      {
        inputs: [16],
        expected: 5,
        explanation: 'Perfect square 2^4: {1,2,4,8,16} gives an odd count.',
      },
      {
        inputs: [49],
        expected: 3,
        explanation: '49 = 7^2: {1,7,49}.',
      },
      {
        inputs: [36],
        expected: 9,
        explanation: '36 = 2^2 * 3^2: (2+1)(2+1) = 9.',
      },
      {
        inputs: [100],
        expected: 9,
        explanation: '100 = 2^2 * 5^2: (2+1)(2+1) = 9.',
      },
      {
        inputs: [97],
        expected: 2,
        explanation: 'Large prime under 100: {1,97}.',
      },
      {
        inputs: [1000000],
        expected: 49,
        explanation: '1000000 = 2^6 * 5^6: (6+1)(6+1) = 49.',
      },
    ],
  },
  {
    slug: 'has-even-digit-count',
    title: 'Even Digit Count Check',
    statementMarkdown:
      "## Task\n\nA logistics scanner at a sorting hub tags each parcel with an integer code `n`. The hub's routing rule only accepts codes whose number of decimal digits is **even**.\n\nGiven an integer `n`, return `true` if the count of decimal digits in the absolute value of `n` is even, and `false` otherwise.\n\nThe sign of `n` is ignored — only the digits count. Note that `0` is written with a single digit.\n\n## Examples\n\n**Example 1**\n\n- Input: `n = 42`\n- Output: `true`\n- Explanation: `42` is written with 2 digits, and 2 is even.\n\n**Example 2**\n\n- Input: `n = 100`\n- Output: `false`\n- Explanation: `100` is written with 3 digits, and 3 is odd.\n\n## Constraints\n\n- `-1000000000 <= n <= 1000000000`\n- The sign of `n` does not affect the digit count.\n- The number `0` counts as having exactly 1 digit.",
    difficulty: 'easy',
    tags: ['math'],
    companies: ['Globex'],
    functionName: 'hasEvenDigitCount',
    ioSpec: {
      params: [
        {
          name: 'n',
          type: 'int',
        },
      ],
      returns: 'bool',
    },
    referenceSolution: {
      python:
        'def hasEvenDigitCount(n):\n    digit_count = len(str(abs(n)))\n    return digit_count % 2 == 0\n',
      javascript:
        'function hasEvenDigitCount(n) {\n    const digitCount = String(Math.abs(n)).length;\n    return digitCount % 2 === 0;\n}\n',
    },
    starterCode: {
      python: 'def hasEvenDigitCount(n):\n    # TODO: implement\n    pass\n',
      javascript: 'function hasEvenDigitCount(n) {\n    // TODO: implement\n}\n',
    },
    sampleTestcases: [
      {
        inputs: [42],
        expected: true,
        explanation: '42 has 2 digits; 2 is even.',
      },
      {
        inputs: [100],
        expected: false,
        explanation: '100 has 3 digits; 3 is odd.',
      },
    ],
    hiddenTestcases: [
      {
        inputs: [0],
        expected: false,
        explanation: '0 counts as 1 digit; 1 is odd.',
      },
      {
        inputs: [7],
        expected: false,
        explanation: 'Single digit; 1 is odd.',
      },
      {
        inputs: [-58],
        expected: true,
        explanation: 'Sign ignored; 58 has 2 digits.',
      },
      {
        inputs: [-9999],
        expected: true,
        explanation: 'Sign ignored; 9999 has 4 digits.',
      },
      {
        inputs: [12345],
        expected: false,
        explanation: '5 digits; odd.',
      },
      {
        inputs: [999999],
        expected: true,
        explanation: '6 digits; even.',
      },
      {
        inputs: [1000000000],
        expected: true,
        explanation: 'Boundary value with 10 digits; even.',
      },
      {
        inputs: [-1000000000],
        expected: true,
        explanation: 'Negative boundary; 10 digits; even.',
      },
    ],
  },
  {
    slug: 'min-absolute-value',
    title: 'Minimum Absolute Value',
    statementMarkdown:
      'A temperature-monitoring sensor logs readings as integers in `nums`, where each value is how far a reading drifted from the target (negative means below target, positive means above). The engineers want to know the single reading that was *closest* to the target, measured by how far it drifted in either direction.\n\nGiven a non-empty integer array `nums`, return the smallest absolute value among its elements. In other words, return the minimum of `|x|` over every element `x` in `nums`.\n\n## Examples\n\n**Example 1**\n\nInput: `nums = [-3, 5, -1, 8]`\nOutput: `1`\nExplanation: The absolute values are `3`, `5`, `1`, `8`. The smallest is `1`, from the element `-1`.\n\n**Example 2**\n\nInput: `nums = [7]`\nOutput: `7`\nExplanation: There is only one element, so its absolute value `7` is the answer.\n\n## Constraints\n\n- `1 <= nums.length <= 100000`\n- `-1000000000 <= nums[i] <= 1000000000`\n- `nums` always contains at least one element.',
    difficulty: 'easy',
    tags: ['arrays', 'math'],
    companies: ['Acme', 'Globex'],
    functionName: 'minAbsValue',
    ioSpec: {
      params: [
        {
          name: 'nums',
          type: {
            array: 'int',
          },
        },
      ],
      returns: 'int',
    },
    referenceSolution: {
      python: 'def minAbsValue(nums):\n    return min(abs(x) for x in nums)\n',
      javascript:
        'function minAbsValue(nums) {\n    let best = Infinity;\n    for (const x of nums) {\n        const a = Math.abs(x);\n        if (a < best) best = a;\n    }\n    return best;\n}\n',
    },
    starterCode: {
      python:
        'def minAbsValue(nums):\n    # TODO: return the smallest absolute value among the elements of nums\n    pass\n',
      javascript:
        'function minAbsValue(nums) {\n    // TODO: return the smallest absolute value among the elements of nums\n}\n',
    },
    sampleTestcases: [
      {
        inputs: [[-3, 5, -1, 8]],
        expected: 1,
        explanation: 'Absolute values are 3, 5, 1, 8; the smallest is 1 (from -1).',
      },
      {
        inputs: [[7]],
        expected: 7,
        explanation: 'Single element, its absolute value is 7.',
      },
    ],
    hiddenTestcases: [
      {
        inputs: [[4]],
        expected: 4,
        explanation: 'Single positive element.',
      },
      {
        inputs: [[-9]],
        expected: 9,
        explanation: 'Single negative element; absolute value is 9.',
      },
      {
        inputs: [[0, 5, -3]],
        expected: 0,
        explanation: 'Zero has the smallest absolute value.',
      },
      {
        inputs: [[-2, -2, -2]],
        expected: 2,
        explanation: 'All elements identical; absolute value is 2.',
      },
      {
        inputs: [[1000000, -999999, 500000]],
        expected: 500000,
        explanation: 'Larger magnitudes; 500000 is the smallest absolute value.',
      },
      {
        inputs: [[3, -3, 6, -6]],
        expected: 3,
        explanation: 'Duplicates and negatives; smallest absolute value is 3.',
      },
      {
        inputs: [[-10, 20, -30, 15, 2]],
        expected: 2,
        explanation: 'Mixed signs; 2 has the smallest absolute value.',
      },
    ],
  },
  {
    slug: 'longest-unique-substring',
    title: 'Longest Substring Without Repeats',
    statementMarkdown:
      'A telemetry service logs a raw character stream `s`. To detect the longest burst of activity before any signal repeats, the team needs the length of the longest **contiguous** substring of `s` in which every character is distinct.\n\nGiven the string `s`, return the length of the longest substring of `s` that contains no repeated character. If `s` is empty, return `0`.\n\nA *substring* is a run of characters at consecutive positions; it cannot skip over positions.\n\n## Examples\n\n### Example 1\n- Input: `s = "abcabcbb"`\n- Output: `3`\n- Explanation: The substring `"abc"` has all-distinct characters and length `3`. Extending to include the next `a` would repeat `a`, so no window longer than `3` stays unique.\n\n### Example 2\n- Input: `s = "abba"`\n- Output: `2`\n- Explanation: Both `"ab"` and `"ba"` have length `2` with distinct characters. Once the second `b` arrives the window must shrink, and the trailing `"ba"` is again length `2`.\n\n## Constraints\n- `0 <= len(s) <= 100000`\n- `s` consists of printable ASCII characters (letters, digits, spaces, punctuation).\n- The answer is an integer between `0` and `len(s)`.',
    difficulty: 'medium',
    tags: ['sliding-window', 'hashing', 'strings'],
    companies: ['Hooli', 'Globex'],
    functionName: 'longestUniqueSubstring',
    ioSpec: {
      params: [
        {
          name: 's',
          type: 'string',
        },
      ],
      returns: 'int',
    },
    referenceSolution: {
      python:
        'def longestUniqueSubstring(s):\n    last = {}\n    left = 0\n    best = 0\n    for right, ch in enumerate(s):\n        if ch in last and last[ch] >= left:\n            left = last[ch] + 1\n        last[ch] = right\n        best = max(best, right - left + 1)\n    return best\n',
      javascript:
        'function longestUniqueSubstring(s) {\n    const last = new Map();\n    let left = 0;\n    let best = 0;\n    for (let right = 0; right < s.length; right++) {\n        const ch = s[right];\n        if (last.has(ch) && last.get(ch) >= left) {\n            left = last.get(ch) + 1;\n        }\n        last.set(ch, right);\n        best = Math.max(best, right - left + 1);\n    }\n    return best;\n}\n',
    },
    starterCode: {
      python:
        'def longestUniqueSubstring(s):\n    # TODO: slide a window over s and track the longest all-distinct run\n    pass\n',
      javascript:
        'function longestUniqueSubstring(s) {\n    // TODO: slide a window over s and track the longest all-distinct run\n}\n',
    },
    sampleTestcases: [
      {
        inputs: ['abcabcbb'],
        expected: 3,
        explanation: '"abc" is the longest distinct-character window.',
      },
      {
        inputs: ['abba'],
        expected: 2,
        explanation: '"ab" then "ba", each length 2.',
      },
    ],
    hiddenTestcases: [
      {
        inputs: [''],
        expected: 0,
        explanation: 'Empty string has no characters.',
      },
      {
        inputs: ['a'],
        expected: 1,
        explanation: 'Single character is trivially unique.',
      },
      {
        inputs: ['bbbbb'],
        expected: 1,
        explanation: 'All identical, so no window longer than 1.',
      },
      {
        inputs: ['pwwkew'],
        expected: 3,
        explanation: '"wke" is the longest distinct run.',
      },
      {
        inputs: ['dvdf'],
        expected: 3,
        explanation: '"vdf" has length 3; the repeated d forces the window forward.',
      },
      {
        inputs: ['tmmzuxt'],
        expected: 5,
        explanation: '"mzuxt" is distinct and length 5.',
      },
      {
        inputs: ['  ab c'],
        expected: 4,
        explanation:
          'Spaces count as characters; after the repeated space resets the left edge, the window "ab c" has length 4.',
      },
      {
        inputs: ['abcdefghijabc'],
        expected: 10,
        explanation: '"abcdefghij" uses ten distinct characters before any repeat.',
      },
    ],
  },
  {
    slug: 'max-window-sum',
    title: 'Maximum Window Sum',
    statementMarkdown:
      'A monitoring dashboard records one integer reading per minute in the array `nums`. An analyst wants to find the busiest stretch of exactly `k` consecutive minutes.\n\nGiven the array `nums` and an integer `k` (with `1 <= k <= len(nums)`), return the **maximum sum** of any contiguous subarray of length exactly `k`. Because the total can grow large, return the answer as a 64-bit integer.\n\nThe efficient approach slides a fixed-size window across the array: keep a running total, and each step add the incoming element and subtract the outgoing one instead of recomputing the whole window.\n\n## Examples\n\n**Example 1**\n\nInput: `nums = [2, 1, 5, 1, 3, 2]`, `k = 3`\nOutput: `9`\nExplanation: The windows of length 3 have sums `8, 7, 9, 6`. The window `[5, 1, 3]` gives the largest sum, `9`.\n\n**Example 2**\n\nInput: `nums = [-3, -1, -4, -2]`, `k = 2`\nOutput: `-4`\nExplanation: The window sums are `-4, -5, -6`. Even when all values are negative, we still pick the largest, `-4`, from `[-3, -1]`.\n\n## Constraints\n\n- `1 <= len(nums) <= 100000`\n- `1 <= k <= len(nums)`\n- `-1000000000 <= nums[i] <= 1000000000`\n- The returned window sum may exceed the 32-bit integer range, so accumulate in a 64-bit (`long`) value.',
    difficulty: 'medium',
    tags: ['sliding-window', 'arrays'],
    companies: ['Hooli', 'Initech'],
    functionName: 'maxWindowSum',
    ioSpec: {
      params: [
        {
          name: 'nums',
          type: {
            array: 'int',
          },
        },
        {
          name: 'k',
          type: 'int',
        },
      ],
      returns: 'long',
    },
    referenceSolution: {
      python:
        'def maxWindowSum(nums, k):\n    window = sum(nums[:k])\n    best = window\n    for i in range(k, len(nums)):\n        window += nums[i] - nums[i - k]\n        if window > best:\n            best = window\n    return best\n',
      javascript:
        'function maxWindowSum(nums, k) {\n    let window = 0;\n    for (let i = 0; i < k; i++) window += nums[i];\n    let best = window;\n    for (let i = k; i < nums.length; i++) {\n        window += nums[i] - nums[i - k];\n        if (window > best) best = window;\n    }\n    return best;\n}\n',
    },
    starterCode: {
      python:
        'def maxWindowSum(nums, k):\n    # TODO: slide a window of size k and return the maximum sum\n    pass\n',
      javascript:
        'function maxWindowSum(nums, k) {\n    // TODO: slide a window of size k and return the maximum sum\n}\n',
    },
    sampleTestcases: [
      {
        inputs: [[2, 1, 5, 1, 3, 2], 3],
        expected: 9,
        explanation: 'Window sums are 8, 7, 9, 6; the maximum is 9 from [5, 1, 3].',
      },
      {
        inputs: [[-3, -1, -4, -2], 2],
        expected: -4,
        explanation: 'All window sums are negative; the largest is -4 from [-3, -1].',
      },
    ],
    hiddenTestcases: [
      {
        inputs: [[7], 1],
        expected: 7,
        explanation: 'Single element with k = 1: the only window is the element itself.',
      },
      {
        inputs: [[4, -2, 6, 1], 4],
        expected: 9,
        explanation:
          'k equals the array length, so the only window is the whole array summing to 9.',
      },
      {
        inputs: [[5, 5, 5, 5, 5], 2],
        expected: 10,
        explanation: 'All elements equal; every window of size 2 sums to 10.',
      },
      {
        inputs: [[1, -2, 3, -1, 2], 2],
        expected: 2,
        explanation: 'Window sums are -1, 1, 2, 1; the maximum is 2 from [3, -1].',
      },
      {
        inputs: [[3, 3, 1, 3], 1],
        expected: 3,
        explanation: 'With k = 1 and duplicates, the best single element is 3.',
      },
      {
        inputs: [[500000000, 500000000, 500000000, 500000000, 500000000], 5],
        expected: 2500000000,
        explanation:
          'The full window sums to 2,500,000,000, which exceeds the 32-bit range and requires a long.',
      },
      {
        inputs: [[4, 2, 7, 1, 9, 3, 6, 5, 8, 2], 4],
        expected: 23,
        explanation: 'Larger case: the best window of size 4 is [9, 3, 6, 5] summing to 23.',
      },
      {
        inputs: [[-5, -2, -8, -1], 1],
        expected: -1,
        explanation: 'All negative with k = 1; the largest single element is -1.',
      },
    ],
  },
  {
    slug: 'is-subsequence',
    title: 'Subsequence Check',
    statementMarkdown:
      'A logging pipeline stores compact "signature" strings and wants to know whether a short signature can be recovered from a longer log line by deleting some characters without reordering the rest.\n\nGiven two strings `s` and `t`, return `true` if `s` is a **subsequence** of `t`, and `false` otherwise.\n\nA string `s` is a subsequence of `t` when every character of `s` appears in `t` in the same relative order, though not necessarily next to each other. For example, `"ac"` is a subsequence of `"abc"` (keep the first and third characters), but `"ca"` is not, because the order would be broken. The empty string is a subsequence of any string, including the empty string.\n\n## Examples\n\n**Example 1**\n\n- Input: `s = "ace"`, `t = "abcde"`\n- Output: `true`\n- Explanation: Reading left to right through `t`, we find `a`, then `c`, then `e` in order, so `s` can be formed by deleting `b` and `d`.\n\n**Example 2**\n\n- Input: `s = "aec"`, `t = "abcde"`\n- Output: `false`\n- Explanation: We can match `a`, then `e`, but after reaching `e` there is no `c` remaining later in `t`, so the required order cannot be satisfied.\n\n## Constraints\n\n- `0 <= s.length <= 1000`\n- `0 <= t.length <= 5000`\n- `s` and `t` consist of printable ASCII characters.\n- If `s` is empty, the answer is always `true`.',
    difficulty: 'medium',
    tags: ['two-pointers', 'strings'],
    companies: ['Hooli', 'Globex'],
    functionName: 'isSubsequence',
    ioSpec: {
      params: [
        {
          name: 's',
          type: 'string',
        },
        {
          name: 't',
          type: 'string',
        },
      ],
      returns: 'bool',
    },
    referenceSolution: {
      python:
        'def isSubsequence(s, t):\n    i = 0\n    n = len(s)\n    for ch in t:\n        if i < n and s[i] == ch:\n            i += 1\n    return i == n\n',
      javascript:
        'function isSubsequence(s, t) {\n    let i = 0;\n    const n = s.length;\n    for (const ch of t) {\n        if (i < n && s[i] === ch) {\n            i += 1;\n        }\n    }\n    return i === n;\n}\n',
    },
    starterCode: {
      python:
        'def isSubsequence(s, t):\n    # TODO: return True if s is a subsequence of t, else False\n    pass\n',
      javascript:
        'function isSubsequence(s, t) {\n    // TODO: return true if s is a subsequence of t, else false\n}\n',
    },
    sampleTestcases: [
      {
        inputs: ['ace', 'abcde'],
        expected: true,
        explanation: 'a, c, e appear in order inside abcde.',
      },
      {
        inputs: ['aec', 'abcde'],
        expected: false,
        explanation: 'After matching a and e, no c remains later, so the order fails.',
      },
    ],
    hiddenTestcases: [
      {
        inputs: ['', 'abc'],
        expected: true,
        explanation: 'The empty string is a subsequence of any string.',
      },
      {
        inputs: ['abc', ''],
        expected: false,
        explanation: 'A non-empty s cannot be a subsequence of empty t.',
      },
      {
        inputs: ['', ''],
        expected: true,
        explanation: 'Empty s is a subsequence of empty t.',
      },
      {
        inputs: ['a', 'b'],
        expected: false,
        explanation: 'Single character has no match in t.',
      },
      {
        inputs: ['aaaa', 'aa'],
        expected: false,
        explanation: "s needs four a's but t only supplies two.",
      },
      {
        inputs: ['cba', 'abcabc'],
        expected: false,
        explanation: 'c then b can be matched, but no a follows the matched b, so order breaks.',
      },
      {
        inputs: ['aaa', 'aaaaa'],
        expected: true,
        explanation: "Three a's are easily found among five a's.",
      },
      {
        inputs: ['codestack', 'ccooddeessttaacckk'],
        expected: true,
        explanation: 'Each character of s is matched against its doubled counterpart in order.',
      },
    ],
  },
  {
    slug: 'count-substring-occurrences',
    title: 'Count Substring Occurrences',
    statementMarkdown:
      'Given two strings `s` and `sub`, return the number of **non-overlapping** times `sub` appears inside `s`, scanning from left to right.\n\nStart searching at the beginning of `s`. Each time you find `sub`, count it and continue searching from the position immediately **after** the matched portion, so matches can never overlap. Matching is case-sensitive. If `sub` is the empty string, return `0`.\n\n## Examples\n\n### Example 1\n\n- **Input:** `s = "abcabcabc"`, `sub = "abc"`\n- **Output:** `3`\n- **Explanation:** `"abc"` appears at indices 0-2, 3-5, and 6-8 with no overlap.\n\n### Example 2\n\n- **Input:** `s = "aaaa"`, `sub = "aa"`\n- **Output:** `2`\n- **Explanation:** The first `"aa"` covers indices 0-1 and the second covers indices 2-3. The potential match at indices 1-2 is skipped because matches may not overlap.\n\n## Constraints\n\n- `0 <= length of s <= 10000`\n- `0 <= length of sub <= 100`\n- `s` and `sub` consist of printable ASCII characters.\n- Matching is case-sensitive.\n- If `sub` is empty, the answer is `0`.',
    difficulty: 'easy',
    tags: ['strings'],
    companies: ['Acme', 'Hooli'],
    functionName: 'countOccurrences',
    ioSpec: {
      params: [
        {
          name: 's',
          type: 'string',
        },
        {
          name: 'sub',
          type: 'string',
        },
      ],
      returns: 'int',
    },
    referenceSolution: {
      python:
        'def countOccurrences(s, sub):\n    if sub == "":\n        return 0\n    count = 0\n    i = 0\n    while True:\n        idx = s.find(sub, i)\n        if idx == -1:\n            break\n        count += 1\n        i = idx + len(sub)\n    return count',
      javascript:
        'function countOccurrences(s, sub) {\n  if (sub === "") return 0;\n  let count = 0;\n  let i = 0;\n  while (true) {\n    const idx = s.indexOf(sub, i);\n    if (idx === -1) break;\n    count += 1;\n    i = idx + sub.length;\n  }\n  return count;\n}',
    },
    starterCode: {
      python:
        'def countOccurrences(s, sub):\n    # TODO: return the number of non-overlapping occurrences of sub in s.\n    # If sub is empty, return 0.\n    pass',
      javascript:
        'function countOccurrences(s, sub) {\n  // TODO: return the number of non-overlapping occurrences of sub in s.\n  // If sub is empty, return 0.\n}',
    },
    sampleTestcases: [
      {
        inputs: ['abcabcabc', 'abc'],
        expected: 3,
        explanation: '"abc" occurs at indices 0-2, 3-5, and 6-8.',
      },
      {
        inputs: ['aaaa', 'aa'],
        expected: 2,
        explanation: 'Non-overlapping matches at 0-1 and 2-3; the overlap at 1-2 is not counted.',
      },
    ],
    hiddenTestcases: [
      {
        inputs: ['hello', ''],
        expected: 0,
        explanation: 'Empty sub returns 0 by definition.',
      },
      {
        inputs: ['', 'a'],
        expected: 0,
        explanation: 'Empty s contains no occurrences.',
      },
      {
        inputs: ['aaaa', 'a'],
        expected: 4,
        explanation: 'Single-character sub matches every position.',
      },
      {
        inputs: ['aaa', 'aa'],
        expected: 1,
        explanation: "First match at 0-1; from index 2 only one 'a' remains, so no second match.",
      },
      {
        inputs: ['mississippi', 'ss'],
        expected: 2,
        explanation: "'ss' matches at indices 2-3 and 5-6.",
      },
      {
        inputs: ['abcabcabc', 'abcabc'],
        expected: 1,
        explanation: "First match covers indices 0-5; remaining 'abc' cannot form another match.",
      },
      {
        inputs: ['banana', 'ana'],
        expected: 1,
        explanation: "'ana' matches at indices 1-3; the overlapping match at 3-5 is skipped.",
      },
      {
        inputs: ['the cat sat on the mat', 'at'],
        expected: 3,
        explanation: "'at' appears in cat, sat, and mat.",
      },
    ],
  },
  {
    slug: 'search-insert-index',
    title: 'Search Insert Index',
    statementMarkdown:
      'A warehouse stores its bin labels as a strictly increasing list of integers `nums`. When a new label `target` arrives, you must report where it belongs:\n\n- If `target` already appears in `nums`, return the index at which it is found.\n- Otherwise, return the index at which inserting `target` would keep `nums` sorted in ascending order.\n\nThe returned index is always in the range `0` to `len(nums)` (inclusive). Because the labels are distinct and already ordered, solve this in `O(log n)` time with binary search rather than scanning linearly.\n\n## Examples\n\n### Example 1\n- Input: `nums = [1, 3, 5, 7]`, `target = 5`\n- Output: `2`\n- Explanation: `target` 5 is present at index 2, so return 2.\n\n### Example 2\n- Input: `nums = [1, 3, 5, 7]`, `target = 4`\n- Output: `2`\n- Explanation: 4 is not in `nums`. It would sit between 3 (index 1) and 5 (index 2), so inserting it at index 2 keeps the list ordered.\n\n## Constraints\n- `0 <= len(nums) <= 10^4`\n- `nums` is sorted in strictly ascending order, and all of its values are distinct.\n- `-10^9 <= nums[i] <= 10^9`\n- `-10^9 <= target <= 10^9`',
    difficulty: 'medium',
    tags: ['binary-search', 'arrays'],
    companies: ['Acme', 'Hooli'],
    functionName: 'searchInsertIndex',
    ioSpec: {
      params: [
        {
          name: 'nums',
          type: {
            array: 'int',
          },
        },
        {
          name: 'target',
          type: 'int',
        },
      ],
      returns: 'int',
    },
    referenceSolution: {
      python:
        'def searchInsertIndex(nums, target):\n    lo, hi = 0, len(nums)\n    while lo < hi:\n        mid = (lo + hi) // 2\n        if nums[mid] < target:\n            lo = mid + 1\n        else:\n            hi = mid\n    return lo\n',
      javascript:
        'function searchInsertIndex(nums, target) {\n    let lo = 0, hi = nums.length;\n    while (lo < hi) {\n        const mid = Math.floor((lo + hi) / 2);\n        if (nums[mid] < target) {\n            lo = mid + 1;\n        } else {\n            hi = mid;\n        }\n    }\n    return lo;\n}\n',
    },
    starterCode: {
      python:
        'def searchInsertIndex(nums, target):\n    # TODO: use binary search to find the lower-bound index of target.\n    pass\n',
      javascript:
        'function searchInsertIndex(nums, target) {\n    // TODO: use binary search to find the lower-bound index of target.\n}\n',
    },
    sampleTestcases: [
      {
        inputs: [[1, 3, 5, 7], 5],
        expected: 2,
        explanation: '5 is found at index 2.',
      },
      {
        inputs: [[1, 3, 5, 7], 4],
        expected: 2,
        explanation: '4 is not present; it would be inserted at index 2.',
      },
    ],
    hiddenTestcases: [
      {
        inputs: [[], 3],
        expected: 0,
        explanation: 'Empty list: any target is inserted at index 0.',
      },
      {
        inputs: [[10], 10],
        expected: 0,
        explanation: 'Single element equal to target: found at index 0.',
      },
      {
        inputs: [[10], 5],
        expected: 0,
        explanation: 'Target smaller than the only element: insert at front.',
      },
      {
        inputs: [[10], 15],
        expected: 1,
        explanation: 'Target larger than the only element: insert at the end (index 1).',
      },
      {
        inputs: [[2, 4, 6, 8, 10], 1],
        expected: 0,
        explanation: 'Target smaller than all values: insert at index 0.',
      },
      {
        inputs: [[2, 4, 6, 8, 10], 11],
        expected: 5,
        explanation: 'Target larger than all values: insert at index 5 (past the end).',
      },
      {
        inputs: [[-8, -3, 0, 4, 9], -3],
        expected: 1,
        explanation: 'Negative target present at index 1.',
      },
      {
        inputs: [[-50, -20, -5, 0, 3, 12, 27, 44, 61, 80, 99], 13],
        expected: 6,
        explanation: '13 sits between 12 (index 5) and 27 (index 6), so it is inserted at index 6.',
      },
    ],
  },
  {
    slug: 'count-subarrays-with-sum',
    title: 'Count Subarrays With Sum',
    statementMarkdown:
      'An analytics ledger stores a sequence of signed daily balance changes in `nums`. Auditors want to know how many contiguous stretches of days had a combined change of exactly `target`.\n\nGiven an integer array `nums` and an integer `target`, return the number of **contiguous subarrays** whose elements sum to exactly `target`. Values in `nums` may be negative, zero, or positive, and different subarrays that happen to have equal sums are all counted separately.\n\nA subarray is defined by a start index `i` and end index `j` with `i <= j`; it consists of the elements `nums[i], nums[i+1], ..., nums[j]`.\n\n## Examples\n\n### Example 1\n- Input: `nums = [1, 1, 1]`, `target = 2`\n- Output: `2`\n- Explanation: The subarrays `nums[0..1]` and `nums[1..2]` each sum to `2`.\n\n### Example 2\n- Input: `nums = [1, -1, 1, -1]`, `target = 0`\n- Output: `4`\n- Explanation: The qualifying subarrays are `nums[0..1]`, `nums[1..2]`, `nums[2..3]`, and `nums[0..3]`, each summing to `0`.\n\n## Constraints\n- `0 <= nums.length <= 10000`\n- `-10000 <= nums[i] <= 10000`\n- `-100000000 <= target <= 100000000`\n- The answer is guaranteed to fit in a 32-bit signed integer.',
    difficulty: 'medium',
    tags: ['prefix-sums', 'hashing', 'arrays'],
    companies: ['Globex', 'Hooli'],
    functionName: 'countSubarraysWithSum',
    ioSpec: {
      params: [
        {
          name: 'nums',
          type: {
            array: 'int',
          },
        },
        {
          name: 'target',
          type: 'int',
        },
      ],
      returns: 'int',
    },
    referenceSolution: {
      python:
        'def countSubarraysWithSum(nums, target):\n    from collections import defaultdict\n    freq = defaultdict(int)\n    freq[0] = 1\n    prefix = 0\n    count = 0\n    for x in nums:\n        prefix += x\n        count += freq[prefix - target]\n        freq[prefix] += 1\n    return count\n',
      javascript:
        'function countSubarraysWithSum(nums, target) {\n    const freq = new Map();\n    freq.set(0, 1);\n    let prefix = 0;\n    let count = 0;\n    for (const x of nums) {\n        prefix += x;\n        count += freq.get(prefix - target) || 0;\n        freq.set(prefix, (freq.get(prefix) || 0) + 1);\n    }\n    return count;\n}\n',
    },
    starterCode: {
      python:
        'def countSubarraysWithSum(nums, target):\n    # TODO: count contiguous subarrays of nums that sum to target\n    pass\n',
      javascript:
        'function countSubarraysWithSum(nums, target) {\n    // TODO: count contiguous subarrays of nums that sum to target\n}\n',
    },
    sampleTestcases: [
      {
        inputs: [[1, 1, 1], 2],
        expected: 2,
        explanation: 'nums[0..1] and nums[1..2] both sum to 2.',
      },
      {
        inputs: [[1, -1, 1, -1], 0],
        expected: 4,
        explanation: 'nums[0..1], nums[1..2], nums[2..3], and nums[0..3] each sum to 0.',
      },
    ],
    hiddenTestcases: [
      {
        inputs: [[], 0],
        expected: 0,
        explanation: 'An empty array has no subarrays.',
      },
      {
        inputs: [[5], 5],
        expected: 1,
        explanation: 'The single element equals the target.',
      },
      {
        inputs: [[5], 0],
        expected: 0,
        explanation: 'No subarray sums to 0.',
      },
      {
        inputs: [[0, 0, 0], 0],
        expected: 6,
        explanation: 'Every one of the 6 subarrays sums to 0.',
      },
      {
        inputs: [[2, 2, 2, 2], 4],
        expected: 3,
        explanation: 'The three adjacent pairs each sum to 4.',
      },
      {
        inputs: [[-2, -1, -3, 4, -1, 2, 1, -5, 4], 3],
        expected: 3,
        explanation: 'Mixed positive and negative values yield 3 qualifying subarrays.',
      },
      {
        inputs: [[3, 4, 7, 2, -3, 1, 4, 2], 7],
        expected: 4,
        explanation: 'Four distinct subarrays sum to 7.',
      },
      {
        inputs: [[-1, -1, -1, -1], -2],
        expected: 3,
        explanation: 'The three adjacent pairs of -1 each sum to -2.',
      },
    ],
  },
  {
    slug: 'max-gap-after-sort',
    title: 'Maximum Adjacent Gap',
    statementMarkdown:
      'You are calibrating a bank of temperature sensors and want to find the largest "dead zone" in their captured readings — the widest span where no reading falls.\n\nGiven a list of integer readings `nums`, imagine sorting the readings in ascending order. Return the largest difference between two readings that end up **next to each other** after sorting. If `nums` contains fewer than two readings, return `0`.\n\n## Examples\n\n**Example 1**\n\n- Input: `nums = [3, 1, 9, 4]`\n- Output: `5`\n- Explanation: Sorted, the readings are `[1, 3, 4, 9]`. The adjacent gaps are `3-1=2`, `4-3=1`, and `9-4=5`. The largest is `5`.\n\n**Example 2**\n\n- Input: `nums = [10, 10, 10]`\n- Output: `0`\n- Explanation: Sorted, the readings are `[10, 10, 10]`. Every adjacent gap is `0`, so the answer is `0`.\n\n## Constraints\n\n- `0 <= len(nums) <= 100000`\n- `-1000000000 <= nums[i] <= 1000000000`\n- If `nums` has fewer than 2 elements, the answer is `0`.\n- The returned gap always fits in a signed 32-bit integer.',
    difficulty: 'medium',
    tags: ['sorting', 'arrays'],
    companies: ['Globex', 'Hooli'],
    functionName: 'maxAdjacentGap',
    ioSpec: {
      params: [
        {
          name: 'nums',
          type: {
            array: 'int',
          },
        },
      ],
      returns: 'int',
    },
    referenceSolution: {
      python:
        'def maxAdjacentGap(nums):\n    if len(nums) < 2:\n        return 0\n    s = sorted(nums)\n    best = 0\n    for i in range(len(s) - 1):\n        diff = s[i + 1] - s[i]\n        if diff > best:\n            best = diff\n    return best\n',
      javascript:
        'function maxAdjacentGap(nums) {\n    if (nums.length < 2) return 0;\n    const s = nums.slice().sort((a, b) => a - b);\n    let best = 0;\n    for (let i = 0; i + 1 < s.length; i++) {\n        const diff = s[i + 1] - s[i];\n        if (diff > best) best = diff;\n    }\n    return best;\n}\n',
    },
    starterCode: {
      python:
        'def maxAdjacentGap(nums):\n    # TODO: sort nums and return the largest gap between consecutive elements\n    pass\n',
      javascript:
        'function maxAdjacentGap(nums) {\n    // TODO: sort nums and return the largest gap between consecutive elements\n}\n',
    },
    sampleTestcases: [
      {
        inputs: [[3, 1, 9, 4]],
        expected: 5,
        explanation: 'Sorted [1,3,4,9]; gaps 2,1,5; max is 5.',
      },
      {
        inputs: [[10, 10, 10]],
        expected: 0,
        explanation: 'All readings equal, so every adjacent gap is 0.',
      },
    ],
    hiddenTestcases: [
      {
        inputs: [[]],
        expected: 0,
        explanation: 'Empty list has fewer than 2 elements.',
      },
      {
        inputs: [[7]],
        expected: 0,
        explanation: 'Single element has no adjacent pair.',
      },
      {
        inputs: [[-5, -1, -10, 3]],
        expected: 5,
        explanation: 'Sorted [-10,-5,-1,3]; gaps 5,4,4; max is 5.',
      },
      {
        inputs: [[1, 5, 5, 100, 100]],
        expected: 95,
        explanation: 'Sorted [1,5,5,100,100]; gaps 4,0,95,0; max is 95.',
      },
      {
        inputs: [[8, 2]],
        expected: 6,
        explanation: 'Sorted [2,8]; single gap 6.',
      },
      {
        inputs: [[4, 4]],
        expected: 0,
        explanation: 'Two equal elements; gap is 0.',
      },
      {
        inputs: [[15, 3, 22, 8, 1, 40, 41, 60]],
        expected: 19,
        explanation: 'Sorted [1,3,8,15,22,40,41,60]; gaps 2,5,7,7,18,1,19; max is 19.',
      },
      {
        inputs: [[-1000000000, 1000000000, 0]],
        expected: 1000000000,
        explanation: 'Sorted [-1e9,0,1e9]; both gaps are 1000000000.',
      },
    ],
  },
  {
    slug: 'is-balanced-brackets',
    title: 'Balanced Brackets',
    statementMarkdown:
      'A code editor at Acme highlights bracket errors as you type. Given a string `s` containing only the bracket characters `(`, `)`, `[`, `]`, `{`, and `}`, decide whether the brackets are **properly balanced**.\n\nThe string is balanced when every opening bracket has a matching closing bracket of the same type, and pairs are correctly nested. Concretely, a closing bracket must match the most recent still-unmatched opening bracket, and no opening brackets may be left over at the end. The empty string is considered balanced.\n\nReturn `true` if `s` is balanced, otherwise `false`.\n\n## Examples\n\n**Example 1**\n\n- Input: `s = "{[()]}"`\n- Output: `true`\n- Explanation: Reading left to right, each closing bracket matches the most recent unmatched opener: `()` closes first, then `[]`, then `{}`. Nothing is left over.\n\n**Example 2**\n\n- Input: `s = "([)]"`\n- Output: `false`\n- Explanation: After reading `(` and `[`, the next character `)` should match the most recent opener `[`, but it does not. The brackets cross instead of nesting, so the string is not balanced.\n\n## Constraints\n\n- `0 <= s.length <= 10000`\n- `s` consists only of the characters `(`, `)`, `[`, `]`, `{`, `}`.\n- An empty `s` is balanced and returns `true`.',
    difficulty: 'medium',
    tags: ['stack', 'strings'],
    companies: ['Acme', 'Hooli'],
    functionName: 'isBalanced',
    ioSpec: {
      params: [
        {
          name: 's',
          type: 'string',
        },
      ],
      returns: 'bool',
    },
    referenceSolution: {
      python:
        "def isBalanced(s):\n    pairs = {')': '(', ']': '[', '}': '{'}\n    stack = []\n    for ch in s:\n        if ch in '([{':\n            stack.append(ch)\n        else:\n            if not stack or stack[-1] != pairs[ch]:\n                return False\n            stack.pop()\n    return not stack\n",
      javascript:
        "function isBalanced(s) {\n    const pairs = { ')': '(', ']': '[', '}': '{' };\n    const stack = [];\n    for (const ch of s) {\n        if (ch === '(' || ch === '[' || ch === '{') {\n            stack.push(ch);\n        } else {\n            if (stack.length === 0 || stack[stack.length - 1] !== pairs[ch]) {\n                return false;\n            }\n            stack.pop();\n        }\n    }\n    return stack.length === 0;\n}\n",
    },
    starterCode: {
      python:
        'def isBalanced(s):\n    # TODO: Use a stack. Push each opening bracket; on a closing bracket,\n    # check that it matches the top of the stack. Return whether s is balanced.\n    pass\n',
      javascript:
        'function isBalanced(s) {\n    // TODO: Use a stack. Push each opening bracket; on a closing bracket,\n    // check that it matches the top of the stack. Return whether s is balanced.\n}\n',
    },
    sampleTestcases: [
      {
        inputs: ['{[()]}'],
        expected: true,
        explanation: 'Every opener is closed by a matching bracket in correctly nested order.',
      },
      {
        inputs: ['([)]'],
        expected: false,
        explanation:
          "The ')' does not match the most recent opener '[', so the brackets cross instead of nesting.",
      },
    ],
    hiddenTestcases: [
      {
        inputs: [''],
        expected: true,
        explanation: 'The empty string is balanced.',
      },
      {
        inputs: ['('],
        expected: false,
        explanation: 'A single opener is left unmatched at the end.',
      },
      {
        inputs: [']'],
        expected: false,
        explanation: 'A closing bracket appears with no opener to match.',
      },
      {
        inputs: ['()[]{}'],
        expected: true,
        explanation: 'Three independent pairs, each opened and immediately closed.',
      },
      {
        inputs: ['((()'],
        expected: false,
        explanation: 'Only one of the three openers gets closed; two remain on the stack.',
      },
      {
        inputs: ['([{}])'],
        expected: true,
        explanation: "Fully nested: '{}' closes first, then '[]', then '()'.",
      },
      {
        inputs: ['(]'],
        expected: false,
        explanation: "The ']' does not match the most recent opener '('.",
      },
      {
        inputs: ['((()))[]{}([{}])'],
        expected: true,
        explanation:
          'Larger mixed case with nested and sequential groups that all match correctly.',
      },
    ],
  },
  {
    slug: 'count-step-ways',
    title: 'Count Step Ways',
    statementMarkdown:
      'A parcel-sorting robot needs to reach the top shelf of a rack by climbing a vertical ladder of `n` rungs. On every move the robot can pull itself up by exactly **1 rung** or exactly **2 rungs**. Two climbs are considered different if the ordered sequence of moves differs.\n\nGiven the number of rungs `n`, return the number of distinct ordered climbs that carry the robot from the ground to the top rung.\n\nThere is exactly **one** way to climb a ladder with `0` rungs: make no moves at all.\n\n## Examples\n\n### Example 1\n- Input: `n = 3`\n- Output: `3`\n- Explanation: The ordered move sequences are `1+1+1`, `1+2`, and `2+1`.\n\n### Example 2\n- Input: `n = 5`\n- Output: `8`\n- Explanation: There are 8 ordered ways, for instance `1+1+1+1+1`, `2+1+1+1`, `1+2+2`, and `2+2+1`, among others.\n\n## Constraints\n- `0 <= n <= 75`\n- The answer can grow large, so it is returned as a 64-bit integer (`long`).',
    difficulty: 'medium',
    tags: ['dynamic-programming', 'recursion', 'math'],
    companies: ['Hooli', 'Initech'],
    functionName: 'countStepWays',
    ioSpec: {
      params: [
        {
          name: 'n',
          type: 'int',
        },
      ],
      returns: 'long',
    },
    referenceSolution: {
      python:
        'def countStepWays(n):\n    a, b = 1, 1\n    for _ in range(n):\n        a, b = b, a + b\n    return a',
      javascript:
        'function countStepWays(n) {\n  let a = 1, b = 1;\n  for (let i = 0; i < n; i++) {\n    const next = a + b;\n    a = b;\n    b = next;\n  }\n  return a;\n}',
    },
    starterCode: {
      python:
        'def countStepWays(n):\n    # TODO: return the number of distinct ordered ways to climb n rungs\n    # taking 1 or 2 rungs per move. ways(0) = 1.\n    pass',
      javascript:
        'function countStepWays(n) {\n  // TODO: return the number of distinct ordered ways to climb n rungs\n  // taking 1 or 2 rungs per move. ways(0) = 1.\n}',
    },
    sampleTestcases: [
      {
        inputs: [3],
        expected: 3,
        explanation: 'The ordered sequences are 1+1+1, 1+2, and 2+1.',
      },
      {
        inputs: [5],
        expected: 8,
        explanation: 'There are 8 ordered ways to reach the 5th rung.',
      },
    ],
    hiddenTestcases: [
      {
        inputs: [0],
        expected: 1,
        explanation: 'A ladder with no rungs is climbed by making no moves: exactly one way.',
      },
      {
        inputs: [1],
        expected: 1,
        explanation: 'Only a single 1-rung move.',
      },
      {
        inputs: [2],
        expected: 2,
        explanation: 'Either 1+1 or 2.',
      },
      {
        inputs: [10],
        expected: 89,
        explanation: 'Follows the Fibonacci recurrence: ways(10) = ways(9) + ways(8) = 55 + 34.',
      },
      {
        inputs: [20],
        expected: 10946,
        explanation: 'ways(20) equals the 21st Fibonacci number.',
      },
      {
        inputs: [50],
        expected: 20365011074,
        explanation: 'Exceeds the 32-bit range, demonstrating the need for a 64-bit result.',
      },
      {
        inputs: [70],
        expected: 308061521170129,
        explanation: 'A large case near the upper bound of n.',
      },
    ],
  },
  {
    slug: 'min-coins-for-amount',
    title: 'Minimum Coins for Amount',
    statementMarkdown:
      'A vending machine restocking tool needs to dispense a target sum using as few coins as possible. You are given an array `coins` of positive denominations and a non-negative integer `amount`. You have an **unlimited** supply of each denomination.\n\nReturn the **minimum number of coins** whose values add up exactly to `amount`. If no combination of the given denominations can reach `amount`, return `-1`. An `amount` of `0` requires `0` coins.\n\nNote that a purely greedy "take the biggest coin first" strategy does not always work; you must consider all denominations.\n\n## Examples\n\n**Example 1**\n\n- Input: `coins = [1, 2, 5]`, `amount = 11`\n- Output: `3`\n- Explanation: `5 + 5 + 1 = 11` uses 3 coins, and no combination uses fewer.\n\n**Example 2**\n\n- Input: `coins = [3, 7]`, `amount = 5`\n- Output: `-1`\n- Explanation: No sum of `3`s and `7`s equals `5`, so it is impossible.\n\n## Constraints\n\n- `1 <= coins.length <= 100`\n- `1 <= coins[i] <= 10000`\n- `0 <= amount <= 10000`\n- Denominations may repeat, and the answer for a reachable `amount` fits in a 32-bit integer.',
    difficulty: 'medium',
    tags: ['dynamic-programming', 'greedy'],
    companies: ['Acme', 'Hooli'],
    functionName: 'minCoins',
    ioSpec: {
      params: [
        {
          name: 'coins',
          type: {
            array: 'int',
          },
        },
        {
          name: 'amount',
          type: 'int',
        },
      ],
      returns: 'int',
    },
    referenceSolution: {
      python:
        "def minCoins(coins, amount):\n    INF = float('inf')\n    dp = [0] + [INF] * amount\n    for x in range(1, amount + 1):\n        for c in coins:\n            if c <= x and dp[x - c] + 1 < dp[x]:\n                dp[x] = dp[x - c] + 1\n    return dp[amount] if dp[amount] != INF else -1\n",
      javascript:
        'function minCoins(coins, amount) {\n  const INF = Infinity;\n  const dp = new Array(amount + 1).fill(INF);\n  dp[0] = 0;\n  for (let x = 1; x <= amount; x++) {\n    for (const c of coins) {\n      if (c <= x && dp[x - c] + 1 < dp[x]) {\n        dp[x] = dp[x - c] + 1;\n      }\n    }\n  }\n  return dp[amount] === INF ? -1 : dp[amount];\n}\n',
    },
    starterCode: {
      python:
        'def minCoins(coins, amount):\n    # TODO: return the minimum number of coins summing to amount, or -1 if impossible.\n    pass\n',
      javascript:
        'function minCoins(coins, amount) {\n  // TODO: return the minimum number of coins summing to amount, or -1 if impossible.\n}\n',
    },
    sampleTestcases: [
      {
        inputs: [[1, 2, 5], 11],
        expected: 3,
        explanation: '5 + 5 + 1 uses 3 coins, the fewest possible.',
      },
      {
        inputs: [[3, 7], 5],
        expected: -1,
        explanation: 'No combination of 3 and 7 sums to 5.',
      },
    ],
    hiddenTestcases: [
      {
        inputs: [[1], 0],
        expected: 0,
        explanation: 'Amount 0 needs no coins.',
      },
      {
        inputs: [[2], 3],
        expected: -1,
        explanation: 'Only even totals are reachable with denomination 2, so 3 is impossible.',
      },
      {
        inputs: [[1], 7],
        expected: 7,
        explanation: 'Seven 1-coins are required.',
      },
      {
        inputs: [[5, 10, 25], 30],
        expected: 2,
        explanation: '25 + 5 = 30 uses 2 coins, better than 10 + 10 + 10.',
      },
      {
        inputs: [[9, 6, 5, 1], 11],
        expected: 2,
        explanation: '6 + 5 = 11; a greedy pick of 9 would need 9 + 1 + 1 = 3 coins.',
      },
      {
        inputs: [[2, 3], 7],
        expected: 3,
        explanation: '2 + 2 + 3 = 7 uses 3 coins.',
      },
      {
        inputs: [[1, 2, 5], 100],
        expected: 20,
        explanation: 'Twenty 5-coins reach 100; a larger case.',
      },
      {
        inputs: [[4, 4], 8],
        expected: 2,
        explanation: 'Duplicate denominations still give 4 + 4 = 8 with 2 coins.',
      },
    ],
  },
  {
    slug: 'count-sorted-rows',
    title: 'Count Sorted Rows',
    statementMarkdown:
      'A warehouse robot scans a grid of shelf labels row by row. For quality control, it needs to know how many rows are already tidy — that is, how many rows have their values arranged in **non-decreasing** order from left to right.\n\nGiven an integer matrix `grid`, return the number of rows whose elements never decrease as you move from left to right. A row is considered sorted if for every adjacent pair of values the left value is less than or equal to the right value. Equal neighbors are allowed.\n\nSpecial cases:\n- A row with 0 or 1 element is always considered sorted.\n- If `grid` has no rows at all, the answer is `0`.\n\n## Examples\n\n**Example 1**\n\nInput: `grid = [[1,2,3],[3,2,1],[5,5,5]]`\n\nOutput: `2`\n\nExplanation: Row `[1,2,3]` is non-decreasing, and row `[5,5,5]` is non-decreasing (equal neighbors count). Row `[3,2,1]` decreases, so it does not count. Two rows qualify.\n\n**Example 2**\n\nInput: `grid = [[7]]`\n\nOutput: `1`\n\nExplanation: A single-element row is always sorted, so it counts.\n\n## Constraints\n\n- `0 <= number of rows in grid <= 200`\n- `0 <= length of each row <= 200`\n- Rows may have different lengths.\n- `-2,000,000,000 <= grid[i][j] <= 2,000,000,000`',
    difficulty: 'medium',
    tags: ['matrix'],
    companies: ['Hooli', 'Initech'],
    functionName: 'countSortedRows',
    ioSpec: {
      params: [
        {
          name: 'grid',
          type: {
            matrix: 'int',
          },
        },
      ],
      returns: 'int',
    },
    referenceSolution: {
      python:
        'def countSortedRows(grid):\n    count = 0\n    for row in grid:\n        if all(row[i] <= row[i + 1] for i in range(len(row) - 1)):\n            count += 1\n    return count\n',
      javascript:
        'function countSortedRows(grid) {\n    let count = 0;\n    for (const row of grid) {\n        let sorted = true;\n        for (let i = 0; i + 1 < row.length; i++) {\n            if (row[i] > row[i + 1]) {\n                sorted = false;\n                break;\n            }\n        }\n        if (sorted) count++;\n    }\n    return count;\n}\n',
    },
    starterCode: {
      python:
        'def countSortedRows(grid):\n    # TODO: count rows whose elements are in non-decreasing order.\n    pass\n',
      javascript:
        'function countSortedRows(grid) {\n    // TODO: count rows whose elements are in non-decreasing order.\n}\n',
    },
    sampleTestcases: [
      {
        inputs: [
          [
            [1, 2, 3],
            [3, 2, 1],
            [5, 5, 5],
          ],
        ],
        expected: 2,
        explanation: 'Rows [1,2,3] and [5,5,5] are non-decreasing; [3,2,1] is not.',
      },
      {
        inputs: [[[7]]],
        expected: 1,
        explanation: 'A single-element row is always sorted.',
      },
    ],
    hiddenTestcases: [
      {
        inputs: [[]],
        expected: 0,
        explanation: 'An empty grid has no rows, so the answer is 0.',
      },
      {
        inputs: [[[]]],
        expected: 1,
        explanation: 'A row of length 0 counts as sorted.',
      },
      {
        inputs: [
          [
            [-3, -1, 0, 0],
            [2, -2],
          ],
        ],
        expected: 1,
        explanation: 'First row is non-decreasing including equal neighbors; second row decreases.',
      },
      {
        inputs: [[[4, 4], [4, 4, 4], [4]]],
        expected: 3,
        explanation: 'All rows have equal neighbors, so all three are sorted.',
      },
      {
        inputs: [[[1, 1, 2, 2, 1]]],
        expected: 0,
        explanation: 'The final drop from 2 to 1 breaks the order.',
      },
      {
        inputs: [[[-2000000000, 0, 2000000000]]],
        expected: 1,
        explanation: 'Boundary magnitudes still form a non-decreasing row.',
      },
      {
        inputs: [
          [
            [1, 2, 3, 4, 5],
            [5, 4, 3, 2, 1],
            [1, 1, 1, 1, 1],
            [0, -1],
            [10, 20, 30],
            [3, 3, 4, 4, 5],
          ],
        ],
        expected: 4,
        explanation: 'Rows 1, 3, 5, and 6 are non-decreasing; rows 2 and 4 decrease.',
      },
      {
        inputs: [[[9], [8, 7], [1, 2], []]],
        expected: 3,
        explanation: 'Single-element, ascending, and empty rows all count; [8,7] does not.',
      },
    ],
  },
  {
    slug: 'max-subarray-sum',
    title: 'Maximum Subarray Sum',
    statementMarkdown:
      'A tournament tracks the point swing your team earns in each consecutive round, given as the array `nums`. A swing can be negative when a round goes badly.\n\nYour **streak score** is the total of the swings over any single block of back-to-back rounds you pick, and you must include at least one round. Return the largest streak score you can achieve.\n\nBecause you must play at least one round, an all-losing tournament still yields an answer: the single least-bad round.\n\n## Examples\n\n**Example 1**\n\n- Input: `nums = [-3, 4, -1, 2, 1, -6, 3]`\n- Output: `6`\n- Explanation: The block `[4, -1, 2, 1]` sums to `6`, which beats every other contiguous block.\n\n**Example 2**\n\n- Input: `nums = [-5, -2, -8, -1]`\n- Output: `-1`\n- Explanation: Every round loses points, so the best you can do is play the single round with the smallest loss, `-1`.\n\n## Constraints\n\n- `1 <= nums.length <= 10^5`\n- `-10^4 <= nums[i] <= 10^4`\n- The subarray must be contiguous and contain at least one element.',
    difficulty: 'medium',
    tags: ['dynamic-programming', 'arrays'],
    companies: ['Globex', 'Hooli'],
    functionName: 'maxSubarraySum',
    ioSpec: {
      params: [
        {
          name: 'nums',
          type: {
            array: 'int',
          },
        },
      ],
      returns: 'int',
    },
    referenceSolution: {
      python:
        'def maxSubarraySum(nums):\n    best = nums[0]\n    cur = nums[0]\n    for x in nums[1:]:\n        cur = max(x, cur + x)\n        best = max(best, cur)\n    return best\n',
      javascript:
        'function maxSubarraySum(nums) {\n    let best = nums[0];\n    let cur = nums[0];\n    for (let i = 1; i < nums.length; i++) {\n        cur = Math.max(nums[i], cur + nums[i]);\n        best = Math.max(best, cur);\n    }\n    return best;\n}\n',
    },
    starterCode: {
      python:
        'def maxSubarraySum(nums):\n    # TODO: return the maximum sum over all non-empty contiguous subarrays\n    pass\n',
      javascript:
        'function maxSubarraySum(nums) {\n    // TODO: return the maximum sum over all non-empty contiguous subarrays\n}\n',
    },
    sampleTestcases: [
      {
        inputs: [[-3, 4, -1, 2, 1, -6, 3]],
        expected: 6,
        explanation: 'The block [4, -1, 2, 1] sums to 6, the largest of any contiguous block.',
      },
      {
        inputs: [[-5, -2, -8, -1]],
        expected: -1,
        explanation:
          'All rounds lose points, so the best streak is the single least-negative element, -1.',
      },
    ],
    hiddenTestcases: [
      {
        inputs: [[7]],
        expected: 7,
        explanation: 'Single positive element; the only subarray is the whole array.',
      },
      {
        inputs: [[-4]],
        expected: -4,
        explanation: 'Single negative element must still be chosen.',
      },
      {
        inputs: [[2, 2, 2, 2]],
        expected: 8,
        explanation: 'All positive, so the whole array is best: 2+2+2+2=8.',
      },
      {
        inputs: [[-3, -3, -3]],
        expected: -3,
        explanation: 'All identical negatives; best is any single element, -3.',
      },
      {
        inputs: [[1, -2, 3, 3, -1, 2]],
        expected: 7,
        explanation: 'The block [3, 3, -1, 2] sums to 7.',
      },
      {
        inputs: [[0, -1, 0, -2, 0]],
        expected: 0,
        explanation: 'Best contiguous sum is a single 0; no gain from including any negative.',
      },
      {
        inputs: [[5, -3, 6, -2, -1, 4, -8, 7, 2, -1, 3, -10, 8, 8, -2, 1]],
        expected: 18,
        explanation:
          "Larger mixed case. Kadane's running sum never drops below zero, so the best block is the prefix [5, -3, 6, -2, -1, 4, -8, 7, 2, -1, 3, -10, 8, 8] (up to the second 8), which totals 18.",
      },
      {
        inputs: [[-1, 5]],
        expected: 5,
        explanation: 'Dropping the leading -1 gives the best block [5]=5.',
      },
    ],
  },
  {
    slug: 'count-with-greater-ahead',
    title: 'Count Elements With a Greater Element Ahead',
    statementMarkdown:
      'Given an integer array `nums`, we say an index `i` is **surpassed** when there is at least one index `j` with `j > i` and `nums[j]` strictly greater than `nums[i]`. In other words, somewhere to the right of position `i` sits a larger value.\n\nReturn the total number of indices in `nums` that are surpassed.\n\n## Examples\n\n### Example 1\nInput: `nums = [3, 1, 4, 1, 5, 9, 2, 6]`\nOutput: `6`\nExplanation: Only two positions are not surpassed: the `9` at index 5 (nothing to its right beats it) and the trailing `6` at index 7 (nothing lies to its right). The other 6 positions each have a strictly larger value somewhere ahead.\n\n### Example 2\nInput: `nums = [5, 4, 3, 2, 1]`\nOutput: `0`\nExplanation: The array is strictly decreasing, so no value ever has a larger value ahead of it.\n\n## Constraints\n- `0 <= nums.length <= 100000`\n- `-1000000000 <= nums[i] <= 1000000000`\n- The answer is a single integer between `0` and `nums.length`.',
    difficulty: 'medium',
    tags: ['stack', 'arrays'],
    companies: ['Hooli', 'Initech'],
    functionName: 'countWithGreaterAhead',
    ioSpec: {
      params: [
        {
          name: 'nums',
          type: {
            array: 'int',
          },
        },
      ],
      returns: 'int',
    },
    referenceSolution: {
      python:
        "def countWithGreaterAhead(nums):\n    count = 0\n    max_ahead = float('-inf')\n    for i in range(len(nums) - 1, -1, -1):\n        if nums[i] < max_ahead:\n            count += 1\n        if nums[i] > max_ahead:\n            max_ahead = nums[i]\n    return count\n",
      javascript:
        'function countWithGreaterAhead(nums) {\n    let count = 0;\n    let maxAhead = -Infinity;\n    for (let i = nums.length - 1; i >= 0; i--) {\n        if (nums[i] < maxAhead) {\n            count += 1;\n        }\n        if (nums[i] > maxAhead) {\n            maxAhead = nums[i];\n        }\n    }\n    return count;\n}\n',
    },
    starterCode: {
      python: 'def countWithGreaterAhead(nums):\n    # TODO: implement\n    pass\n',
      javascript: 'function countWithGreaterAhead(nums) {\n    // TODO: implement\n}\n',
    },
    sampleTestcases: [
      {
        inputs: [[3, 1, 4, 1, 5, 9, 2, 6]],
        expected: 6,
        explanation:
          'All positions except the 9 (index 5) and the last 6 (index 7) have a strictly larger value ahead.',
      },
      {
        inputs: [[5, 4, 3, 2, 1]],
        expected: 0,
        explanation: 'Strictly decreasing, so nothing is surpassed.',
      },
    ],
    hiddenTestcases: [
      {
        inputs: [[]],
        expected: 0,
        explanation: 'Empty array has no positions.',
      },
      {
        inputs: [[42]],
        expected: 0,
        explanation: 'A single element has nothing ahead of it.',
      },
      {
        inputs: [[1, 2, 3, 4, 5]],
        expected: 4,
        explanation: 'Strictly increasing: every position except the last is surpassed.',
      },
      {
        inputs: [[7, 7, 7]],
        expected: 0,
        explanation: 'All equal; strictly greater is never satisfied.',
      },
      {
        inputs: [[-1, -5, -3, -2]],
        expected: 2,
        explanation:
          '-5 (has -3/-2 ahead) and -3 (has -2 ahead) are surpassed; -1 and the trailing -2 are not.',
      },
      {
        inputs: [[2, 2, 3, 1]],
        expected: 2,
        explanation: 'Both 2s have the 3 ahead; the 3 and trailing 1 are not surpassed.',
      },
      {
        inputs: [[10, 3, 7, 7, 8, 1, 9, 5, 6, 2]],
        expected: 6,
        explanation:
          'Positions with values 3,7,7,8,1,5 each have a larger value ahead; 10, 9, 6 (as running maxima) and the final 2 are not surpassed.',
      },
      {
        inputs: [[1, 2]],
        expected: 1,
        explanation: 'The 1 has the larger 2 ahead of it.',
      },
    ],
  },
  {
    slug: 'can-reach-end',
    title: 'Can Reach End',
    statementMarkdown:
      'A courier drone hovers over a row of rooftops. Rooftop `i` has a charge meter `nums[i]`, a non-negative integer telling the maximum number of rooftops forward the drone may glide in a single hop from that rooftop. The drone starts on the first rooftop (index `0`).\n\nReturn `true` if the drone can reach the **last** rooftop starting from index `0`, and `false` otherwise. A hop of length `k` from index `i` may land on any rooftop from index `i` up to index `i + k` (you are free to choose a shorter hop). If the row has only one rooftop, the drone is already at the end.\n\n## Examples\n\n### Example 1\n- Input: `nums = [2, 3, 1, 1, 4]`\n- Output: `true`\n- Explanation: Hop from index `0` (charge `2`) to index `1`, then from index `1` (charge `3`) straight to index `4`, the last rooftop.\n\n### Example 2\n- Input: `nums = [3, 2, 1, 0, 4]`\n- Output: `false`\n- Explanation: No matter how the hops are chosen, the drone cannot get past index `3`, whose charge is `0`. The farthest reachable rooftop is index `3`, so index `4` is never reached.\n\n## Constraints\n- `1 <= nums.length <= 10000`\n- `0 <= nums[i] <= 100000`',
    difficulty: 'medium',
    tags: ['greedy', 'arrays'],
    companies: ['Hooli', 'Initech'],
    functionName: 'canReachEnd',
    ioSpec: {
      params: [
        {
          name: 'nums',
          type: {
            array: 'int',
          },
        },
      ],
      returns: 'bool',
    },
    referenceSolution: {
      python:
        'def canReachEnd(nums):\n    furthest = 0\n    n = len(nums)\n    for i in range(n):\n        if i > furthest:\n            return False\n        furthest = max(furthest, i + nums[i])\n        if furthest >= n - 1:\n            return True\n    return True\n',
      javascript:
        'function canReachEnd(nums) {\n  let furthest = 0;\n  const n = nums.length;\n  for (let i = 0; i < n; i++) {\n    if (i > furthest) return false;\n    furthest = Math.max(furthest, i + nums[i]);\n    if (furthest >= n - 1) return true;\n  }\n  return true;\n}\n',
    },
    starterCode: {
      python:
        'def canReachEnd(nums):\n    # TODO: return True if the last index is reachable from index 0, else False.\n    pass\n',
      javascript:
        'function canReachEnd(nums) {\n  // TODO: return true if the last index is reachable from index 0, else false.\n}\n',
    },
    sampleTestcases: [
      {
        inputs: [[2, 3, 1, 1, 4]],
        expected: true,
        explanation: 'Hop 0->1 then 1->4 reaches the last rooftop.',
      },
      {
        inputs: [[3, 2, 1, 0, 4]],
        expected: false,
        explanation: 'The zero at index 3 blocks all paths; the farthest reachable index is 3.',
      },
    ],
    hiddenTestcases: [
      {
        inputs: [[0]],
        expected: true,
        explanation: 'Single rooftop: the drone already starts at the last index.',
      },
      {
        inputs: [[0, 1]],
        expected: false,
        explanation: 'Charge 0 at the start; the drone can never leave index 0.',
      },
      {
        inputs: [[1, 0]],
        expected: true,
        explanation: 'One hop of length 1 lands exactly on the last rooftop.',
      },
      {
        inputs: [[2, 0, 0, 3, 1]],
        expected: false,
        explanation: 'The best reach is index 2; index 3 and beyond are unreachable.',
      },
      {
        inputs: [[4, 0, 0, 0, 0]],
        expected: true,
        explanation: 'A single hop of length 4 from index 0 reaches the last index directly.',
      },
      {
        inputs: [[5, 4, 3, 2, 1, 0, 0]],
        expected: false,
        explanation: 'Every rooftop reaches at most index 5, so index 6 is never reached.',
      },
      {
        inputs: [[3, 3, 1, 0, 2, 0, 1]],
        expected: true,
        explanation: '0->1 (reach 4), then 4->6 with charge 2 lands on the last index.',
      },
      {
        inputs: [[1, 1, 1, 1, 1, 1, 1, 1, 1, 1]],
        expected: true,
        explanation: 'Chain of length-1 hops walks all the way to the end.',
      },
    ],
  },
  {
    slug: 'first-repeated-index',
    title: 'First Repeated Element Index',
    statementMarkdown:
      'A turnstile logging system records visitor badge numbers into an array `nums` in the exact order people pass through a gate. You want to find the earliest moment a badge is scanned that had already been scanned earlier that day.\n\nScanning `nums` from left to right, return the smallest index `i` such that the value `nums[i]` has already appeared at some strictly earlier index. If no value ever repeats, return `-1`.\n\n## Examples\n\n### Example 1\n- Input: `nums = [5, 3, 9, 3, 7]`\n- Output: `3`\n- Explanation: The values at indices 0, 1, 2 are all new. At index 3 the value `3` was already seen at index 1, so `3` is the first index whose value repeats an earlier one.\n\n### Example 2\n- Input: `nums = [1, 2, 3, 4]`\n- Output: `-1`\n- Explanation: Every value is distinct, so no index repeats an earlier value.\n\n## Constraints\n- `0 <= nums.length <= 100000`\n- `-2000000000 <= nums[i] <= 2000000000`\n- The returned index refers to the position of the *repeat* (the later occurrence), not the first occurrence.',
    difficulty: 'medium',
    tags: ['hashing', 'arrays'],
    companies: ['Acme', 'Hooli'],
    functionName: 'firstRepeatedIndex',
    ioSpec: {
      params: [
        {
          name: 'nums',
          type: {
            array: 'int',
          },
        },
      ],
      returns: 'int',
    },
    referenceSolution: {
      python:
        'def firstRepeatedIndex(nums):\n    seen = set()\n    for i, v in enumerate(nums):\n        if v in seen:\n            return i\n        seen.add(v)\n    return -1\n',
      javascript:
        'function firstRepeatedIndex(nums) {\n    const seen = new Set();\n    for (let i = 0; i < nums.length; i++) {\n        if (seen.has(nums[i])) {\n            return i;\n        }\n        seen.add(nums[i]);\n    }\n    return -1;\n}\n',
    },
    starterCode: {
      python:
        'def firstRepeatedIndex(nums):\n    # TODO: return the smallest index whose value already appeared earlier, else -1\n    pass\n',
      javascript:
        'function firstRepeatedIndex(nums) {\n    // TODO: return the smallest index whose value already appeared earlier, else -1\n}\n',
    },
    sampleTestcases: [
      {
        inputs: [[5, 3, 9, 3, 7]],
        expected: 3,
        explanation: 'Value 3 at index 3 repeats the 3 first seen at index 1.',
      },
      {
        inputs: [[1, 2, 3, 4]],
        expected: -1,
        explanation: 'All values are distinct, so no index repeats an earlier value.',
      },
    ],
    hiddenTestcases: [
      {
        inputs: [[]],
        expected: -1,
        explanation: 'Empty array has no repeats.',
      },
      {
        inputs: [[7]],
        expected: -1,
        explanation: 'A single element cannot repeat.',
      },
      {
        inputs: [[-2, 4, -2, 4]],
        expected: 2,
        explanation: 'Value -2 at index 2 repeats the -2 first seen at index 0.',
      },
      {
        inputs: [[8, 8, 8]],
        expected: 1,
        explanation: 'The second 8 (index 1) is the first repeat.',
      },
      {
        inputs: [[10, 20, 30, 20, 10]],
        expected: 3,
        explanation:
          '20 at index 3 repeats before 10 at index 4, so 3 is the smallest repeat index.',
      },
      {
        inputs: [[2000000000, -2000000000, 2000000000]],
        expected: 2,
        explanation: 'Boundary values: 2000000000 repeats at index 2.',
      },
      {
        inputs: [[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 3]],
        expected: 12,
        explanation: 'Larger case where the only repeat, value 3, occurs at the final index 12.',
      },
      {
        inputs: [[4, 5, 6, 4]],
        expected: 3,
        explanation: 'Value 4 at index 3 repeats the 4 first seen at index 0.',
      },
    ],
  },
  {
    slug: 'matrix-diagonal-sum',
    title: 'Matrix Diagonal Sum',
    statementMarkdown:
      'Given a square matrix `grid` of size `n x n`, return the total sum of the values lying on its two diagonals.\n\nThe **primary diagonal** runs from the top-left corner to the bottom-right corner. The **secondary diagonal** runs from the top-right corner to the bottom-left corner. When `n` is odd, both diagonals meet at the single center cell — that shared cell must be counted **only once**.\n\nBecause the grid can be large and its entries can be big, return the result as a 64-bit integer (`long`).\n\n## Examples\n\n**Example 1**\n\n```\nInput: grid = [[1,2,3],[4,5,6],[7,8,9]]\nOutput: 25\n```\n\nExplanation: The primary diagonal is `1 + 5 + 9 = 15` and the secondary diagonal is `3 + 5 + 7 = 15`. Their combined total is `30`, but the center cell `5` was added twice, so we subtract it once to get `25`.\n\n**Example 2**\n\n```\nInput: grid = [[5,2],[1,4]]\nOutput: 12\n```\n\nExplanation: With `n = 2` there is no shared center. Primary diagonal `5 + 4 = 9`, secondary diagonal `2 + 1 = 3`, total `12`.\n\n## Constraints\n\n- `grid` is a square matrix with `1 <= n <= 1000` rows and columns.\n- `grid.length == grid[i].length == n` for every row.\n- `-10^9 <= grid[i][j] <= 10^9`.\n- The diagonal sum can exceed the 32-bit integer range, so the answer is returned as a `long`.',
    difficulty: 'medium',
    tags: ['matrix'],
    companies: ['Acme', 'Hooli'],
    functionName: 'diagonalSum',
    ioSpec: {
      params: [
        {
          name: 'grid',
          type: {
            matrix: 'int',
          },
        },
      ],
      returns: 'long',
    },
    referenceSolution: {
      python:
        'def diagonalSum(grid):\n    n = len(grid)\n    total = 0\n    for i in range(n):\n        total += grid[i][i]\n        total += grid[i][n - 1 - i]\n    if n % 2 == 1:\n        total -= grid[n // 2][n // 2]\n    return total\n',
      javascript:
        'function diagonalSum(grid) {\n    const n = grid.length;\n    let total = 0;\n    for (let i = 0; i < n; i++) {\n        total += grid[i][i];\n        total += grid[i][n - 1 - i];\n    }\n    if (n % 2 === 1) {\n        total -= grid[Math.floor(n / 2)][Math.floor(n / 2)];\n    }\n    return total;\n}\n',
    },
    starterCode: {
      python:
        'def diagonalSum(grid):\n    # TODO: sum both diagonals; count the shared center cell only once when n is odd\n    pass\n',
      javascript:
        'function diagonalSum(grid) {\n    // TODO: sum both diagonals; count the shared center cell only once when n is odd\n}\n',
    },
    sampleTestcases: [
      {
        inputs: [
          [
            [1, 2, 3],
            [4, 5, 6],
            [7, 8, 9],
          ],
        ],
        expected: 25,
        explanation:
          'Primary 1+5+9=15, secondary 3+5+7=15, total 30 minus the doubly-counted center 5 gives 25.',
      },
      {
        inputs: [
          [
            [5, 2],
            [1, 4],
          ],
        ],
        expected: 12,
        explanation: 'Even n has no shared center: 5+4 + 2+1 = 12.',
      },
    ],
    hiddenTestcases: [
      {
        inputs: [[[7]]],
        expected: 7,
        explanation: 'Single cell: both diagonals are the same cell, counted once.',
      },
      {
        inputs: [
          [
            [2, 2, 2],
            [2, 2, 2],
            [2, 2, 2],
          ],
        ],
        expected: 10,
        explanation:
          'Six diagonal positions of value 2 give 12, minus the doubly-counted center 2 gives 10.',
      },
      {
        inputs: [
          [
            [-1, -2],
            [-3, -4],
          ],
        ],
        expected: -10,
        explanation: 'Negatives: (-1)+(-4) + (-2)+(-3) = -10.',
      },
      {
        inputs: [
          [
            [1, 0, 0, 2],
            [0, 3, 4, 0],
            [0, 5, 6, 0],
            [7, 0, 0, 8],
          ],
        ],
        expected: 36,
        explanation: 'Primary 1+3+6+8=18, secondary 2+4+5+7=18, no shared center, total 36.',
      },
      {
        inputs: [
          [
            [10, 1, 10],
            [1, -5, 1],
            [10, 1, 10],
          ],
        ],
        expected: 35,
        explanation: 'Total 30 with center -5 counted twice; subtract -5 once, giving 30-(-5)=35.',
      },
      {
        inputs: [
          [
            [1000000000, 1000000000, 1000000000],
            [1000000000, 1000000000, 1000000000],
            [1000000000, 1000000000, 1000000000],
          ],
        ],
        expected: 5000000000,
        explanation:
          'Sum 6e9 minus the doubly-counted center 1e9 gives 5e9, exceeding 32-bit range.',
      },
      {
        inputs: [
          [
            [3, 7],
            [7, 3],
          ],
        ],
        expected: 20,
        explanation: 'Primary 3+3=6, secondary 7+7=14, total 20.',
      },
      {
        inputs: [
          [
            [1, 2, 3, 4, 5],
            [6, 7, 8, 9, 10],
            [11, 12, 13, 14, 15],
            [16, 17, 18, 19, 20],
            [21, 22, 23, 24, 25],
          ],
        ],
        expected: 117,
        explanation:
          'Primary 1+7+13+19+25=65, secondary 5+9+13+17+21=65, total 130 minus doubly-counted center 13 gives 117.',
      },
    ],
  },
  {
    slug: 'count-primes-below',
    title: 'Count Primes Below N',
    statementMarkdown:
      'A cryptography team at Hooli caches small prime numbers to speed up key generation. Given a single upper bound `n`, they need to know how many primes fall below it.\n\nWrite a function `countPrimesBelow` that returns the number of prime numbers **strictly less than** `n`.\n\nA prime is an integer greater than 1 whose only positive divisors are 1 and itself. For efficiency, use the Sieve of Eratosthenes rather than testing each number individually. If `n` is 2 or smaller, there are no primes below it, so the answer is `0`.\n\n## Examples\n\n### Example 1\n- Input: `n = 10`\n- Output: `4`\n- Explanation: The primes strictly less than 10 are 2, 3, 5, and 7, giving a count of 4.\n\n### Example 2\n- Input: `n = 2`\n- Output: `0`\n- Explanation: There are no primes strictly less than 2, so the count is 0.\n\n## Constraints\n- `0 <= n <= 5,000,000`\n- The answer always fits in a 32-bit signed integer.',
    difficulty: 'medium',
    tags: ['math', 'sieve'],
    companies: ['Hooli', 'Initech'],
    functionName: 'countPrimesBelow',
    ioSpec: {
      params: [
        {
          name: 'n',
          type: 'int',
        },
      ],
      returns: 'int',
    },
    referenceSolution: {
      python:
        'def countPrimesBelow(n):\n    if n <= 2:\n        return 0\n    sieve = [True] * n\n    sieve[0] = sieve[1] = False\n    i = 2\n    while i * i < n:\n        if sieve[i]:\n            for j in range(i * i, n, i):\n                sieve[j] = False\n        i += 1\n    return sum(sieve)\n',
      javascript:
        'function countPrimesBelow(n) {\n    if (n <= 2) return 0;\n    const sieve = new Array(n).fill(true);\n    sieve[0] = false;\n    sieve[1] = false;\n    for (let i = 2; i * i < n; i++) {\n        if (sieve[i]) {\n            for (let j = i * i; j < n; j += i) {\n                sieve[j] = false;\n            }\n        }\n    }\n    let count = 0;\n    for (let k = 2; k < n; k++) {\n        if (sieve[k]) count++;\n    }\n    return count;\n}\n',
    },
    starterCode: {
      python:
        'def countPrimesBelow(n):\n    # TODO: count the primes strictly less than n\n    pass\n',
      javascript:
        'function countPrimesBelow(n) {\n    // TODO: count the primes strictly less than n\n}\n',
    },
    sampleTestcases: [
      {
        inputs: [10],
        expected: 4,
        explanation: 'Primes below 10 are 2, 3, 5, 7.',
      },
      {
        inputs: [2],
        expected: 0,
        explanation: 'No primes are below 2.',
      },
    ],
    hiddenTestcases: [
      {
        inputs: [0],
        expected: 0,
        explanation: 'n <= 2 yields 0.',
      },
      {
        inputs: [1],
        expected: 0,
        explanation: 'No primes below 1.',
      },
      {
        inputs: [3],
        expected: 1,
        explanation: 'Only prime below 3 is 2.',
      },
      {
        inputs: [13],
        expected: 5,
        explanation: 'Primes below 13: 2, 3, 5, 7, 11.',
      },
      {
        inputs: [20],
        expected: 8,
        explanation: 'Primes below 20: 2, 3, 5, 7, 11, 13, 17, 19.',
      },
      {
        inputs: [100],
        expected: 25,
        explanation: 'There are 25 primes below 100.',
      },
      {
        inputs: [1000],
        expected: 168,
        explanation: 'There are 168 primes below 1000.',
      },
      {
        inputs: [100000],
        expected: 9592,
        explanation: 'Larger case: 9592 primes below 100000.',
      },
    ],
  },
  {
    slug: 'pair-with-difference-exists',
    title: 'Pair With Given Difference',
    statementMarkdown:
      'A monitoring service records a sequence of integer readings and wants to flag whenever two separate readings are offset by an exact amount.\n\nGiven an integer array `nums` and an integer `diff`, decide whether there exist two **distinct positions** `i` and `j` (with `i != j`) such that `nums[i] - nums[j] == diff`. Return `true` if such a pair exists, otherwise return `false`.\n\nBecause the two positions must be different, when `diff == 0` the condition holds only if some value appears at least twice. When `diff != 0`, you simply need two values whose difference is exactly `diff` to both be present somewhere in `nums`.\n\n## Examples\n\n### Example 1\n- Input: `nums = [1, 5, 3, 4, 2]`, `diff = 2`\n- Output: `true`\n- Explanation: The readings `3` and `1` sit at different positions and `3 - 1 == 2`.\n\n### Example 2\n- Input: `nums = [8, 12, 16, 4]`, `diff = 3`\n- Output: `false`\n- Explanation: No two of these readings differ by exactly `3`.\n\n## Constraints\n- `0 <= nums.length <= 100000`\n- `-1000000000 <= nums[i] <= 1000000000`\n- `-1000000000 <= diff <= 1000000000`\n- The answer is a single boolean.',
    difficulty: 'medium',
    tags: ['hashing', 'two-pointers'],
    companies: ['Globex', 'Initech'],
    functionName: 'hasPairWithDiff',
    ioSpec: {
      params: [
        {
          name: 'nums',
          type: {
            array: 'int',
          },
        },
        {
          name: 'diff',
          type: 'int',
        },
      ],
      returns: 'bool',
    },
    referenceSolution: {
      python:
        'def hasPairWithDiff(nums, diff):\n    if diff == 0:\n        seen = set()\n        for x in nums:\n            if x in seen:\n                return True\n            seen.add(x)\n        return False\n    values = set(nums)\n    for v in values:\n        if v + diff in values:\n            return True\n    return False\n',
      javascript:
        'function hasPairWithDiff(nums, diff) {\n    if (diff === 0) {\n        const seen = new Set();\n        for (const x of nums) {\n            if (seen.has(x)) return true;\n            seen.add(x);\n        }\n        return false;\n    }\n    const values = new Set(nums);\n    for (const v of values) {\n        if (values.has(v + diff)) return true;\n    }\n    return false;\n}\n',
    },
    starterCode: {
      python:
        'def hasPairWithDiff(nums, diff):\n    # TODO: return True if some distinct i, j satisfy nums[i] - nums[j] == diff\n    pass\n',
      javascript:
        'function hasPairWithDiff(nums, diff) {\n    // TODO: return true if some distinct i, j satisfy nums[i] - nums[j] === diff\n}\n',
    },
    sampleTestcases: [
      {
        inputs: [[1, 5, 3, 4, 2], 2],
        expected: true,
        explanation: '3 - 1 == 2, and 3 and 1 are at different positions.',
      },
      {
        inputs: [[8, 12, 16, 4], 3],
        expected: false,
        explanation: 'No pair of readings differs by exactly 3.',
      },
    ],
    hiddenTestcases: [
      {
        inputs: [[4, 2, 7, 2], 0],
        expected: true,
        explanation: 'diff is 0 and the value 2 appears twice at distinct positions.',
      },
      {
        inputs: [[1, 2, 3], 0],
        expected: false,
        explanation: 'diff is 0 but every value is unique, so no repeated index pair exists.',
      },
      {
        inputs: [[], 5],
        expected: false,
        explanation: 'Empty array has no positions to pair.',
      },
      {
        inputs: [[10], 3],
        expected: false,
        explanation: 'A single element cannot form a pair of distinct indices.',
      },
      {
        inputs: [[-3, -1, 2, 5], 2],
        expected: true,
        explanation: '-1 - (-3) == 2.',
      },
      {
        inputs: [[10, 4, 7], -3],
        expected: true,
        explanation: '4 - 7 == -3.',
      },
      {
        inputs: [[7, 7, 7], 1],
        expected: false,
        explanation: 'All values equal 7; no two differ by 1 even though duplicates exist.',
      },
      {
        inputs: [[5, 10, 15, 20, 25, 30, 100], 5],
        expected: true,
        explanation: 'Consecutive multiples such as 10 - 5 == 5.',
      },
    ],
  },
  {
    slug: 'longest-common-prefix-length',
    title: 'Longest Common Prefix Length',
    statementMarkdown:
      '## Task\n\nAn autocomplete widget groups a batch of candidate strings and wants to highlight the leading characters they all agree on. Given an array `words`, return the length of the longest string prefix that is shared by **every** element of `words`.\n\nA prefix is compared character by character from the start of each word. The shared prefix ends at the first position where the words disagree or where any word runs out of characters. If `words` is empty, the answer is `0`. If any word is the empty string, no non-empty prefix can be shared, so the answer is `0`.\n\n## Examples\n\n### Example 1\n\n- Input: `words = ["flower", "flow", "flight"]`\n- Output: `2`\n- Explanation: All three words start with `"fl"`. At position 2 they disagree (`"o"`, `"o"`, `"i"`), so the shared prefix `"fl"` has length 2.\n\n### Example 2\n\n- Input: `words = ["dog", "cat", "fish"]`\n- Output: `0`\n- Explanation: The words differ at the very first character, so there is no shared prefix.\n\n## Constraints\n\n- `0 <= len(words) <= 200`\n- `0 <= length of each word <= 200`\n- Each word contains printable ASCII characters.\n- Comparison is case-sensitive (`"A"` and `"a"` are different characters).',
    difficulty: 'medium',
    tags: ['strings'],
    companies: ['Hooli', 'Globex'],
    functionName: 'commonPrefixLength',
    ioSpec: {
      params: [
        {
          name: 'words',
          type: {
            array: 'string',
          },
        },
      ],
      returns: 'int',
    },
    referenceSolution: {
      python:
        'def commonPrefixLength(words):\n    if not words:\n        return 0\n    length = 0\n    first = words[0]\n    for i in range(len(first)):\n        c = first[i]\n        for w in words:\n            if i >= len(w) or w[i] != c:\n                return length\n        length += 1\n    return length\n',
      javascript:
        'function commonPrefixLength(words) {\n    if (words.length === 0) return 0;\n    let length = 0;\n    const first = words[0];\n    for (let i = 0; i < first.length; i++) {\n        const c = first[i];\n        for (const w of words) {\n            if (i >= w.length || w[i] !== c) {\n                return length;\n            }\n        }\n        length++;\n    }\n    return length;\n}\n',
    },
    starterCode: {
      python:
        'def commonPrefixLength(words):\n    # TODO: return the length of the longest prefix shared by every word\n    pass\n',
      javascript:
        'function commonPrefixLength(words) {\n    // TODO: return the length of the longest prefix shared by every word\n}\n',
    },
    sampleTestcases: [
      {
        inputs: [['flower', 'flow', 'flight']],
        expected: 2,
        explanation: 'All words share "fl"; they diverge at position 2.',
      },
      {
        inputs: [['dog', 'cat', 'fish']],
        expected: 0,
        explanation: 'The words differ at the first character.',
      },
    ],
    hiddenTestcases: [
      {
        inputs: [[]],
        expected: 0,
        explanation: 'Empty array has no shared prefix.',
      },
      {
        inputs: [['abc']],
        expected: 3,
        explanation: 'A single word shares its whole length with itself.',
      },
      {
        inputs: [['', 'abc']],
        expected: 0,
        explanation: 'An empty word forces the answer to 0.',
      },
      {
        inputs: [['same', 'same', 'same']],
        expected: 4,
        explanation: 'All identical words share the full length 4.',
      },
      {
        inputs: [['prefix', 'pre', 'preface']],
        expected: 3,
        explanation: 'The shortest word "pre" caps the shared prefix at length 3.',
      },
      {
        inputs: [['a', 'ab', 'abc']],
        expected: 1,
        explanation: 'The first word "a" limits the shared prefix to 1.',
      },
      {
        inputs: [['interstellar', 'internet', 'internal', 'interval']],
        expected: 5,
        explanation: 'All four share "inter" and diverge at position 5.',
      },
      {
        inputs: [['xyz', 'xyz', 'xy']],
        expected: 2,
        explanation: 'The word "xy" runs out at position 2, ending the shared prefix.',
      },
    ],
  },
  {
    slug: 'has-majority-element',
    title: 'Majority Element Check',
    statementMarkdown:
      'A value is called **dominant** in an integer array `nums` when it appears **strictly more than** `floor(n / 2)` times, where `n` is the length of `nums`.\n\nGiven `nums`, return `true` if a dominant value exists, and `false` otherwise. An empty array has no dominant value, so it returns `false`.\n\n## Examples\n\n**Example 1**\n\n- Input: `nums = [3, 3, 4, 2, 3, 3, 3]`\n- Output: `true`\n- Explanation: The array has 7 elements, so a dominant value must appear more than `floor(7 / 2) = 3` times. The value `3` appears 5 times, which clears the bar.\n\n**Example 2**\n\n- Input: `nums = [1, 2, 3, 4]`\n- Output: `false`\n- Explanation: With 4 elements a value must appear more than `floor(4 / 2) = 2` times. Every value appears exactly once, so none dominates.\n\n## Constraints\n\n- `0 <= nums.length <= 100000`\n- `-1000000000 <= nums[i] <= 1000000000`\n- A value counts as dominant only when its number of occurrences is strictly greater than `floor(n / 2)` (a value appearing exactly `n / 2` times is **not** dominant).',
    difficulty: 'medium',
    tags: ['counting', 'arrays'],
    companies: ['Hooli', 'Initech'],
    functionName: 'hasMajority',
    ioSpec: {
      params: [
        {
          name: 'nums',
          type: {
            array: 'int',
          },
        },
      ],
      returns: 'bool',
    },
    referenceSolution: {
      python:
        'def hasMajority(nums):\n    if not nums:\n        return False\n    candidate = None\n    count = 0\n    for x in nums:\n        if count == 0:\n            candidate = x\n            count = 1\n        elif x == candidate:\n            count += 1\n        else:\n            count -= 1\n    occ = sum(1 for x in nums if x == candidate)\n    return occ > len(nums) // 2\n',
      javascript:
        'function hasMajority(nums) {\n    if (nums.length === 0) return false;\n    let candidate = null;\n    let count = 0;\n    for (const x of nums) {\n        if (count === 0) {\n            candidate = x;\n            count = 1;\n        } else if (x === candidate) {\n            count += 1;\n        } else {\n            count -= 1;\n        }\n    }\n    let occ = 0;\n    for (const x of nums) {\n        if (x === candidate) occ += 1;\n    }\n    return occ > Math.floor(nums.length / 2);\n}\n',
    },
    starterCode: {
      python:
        'def hasMajority(nums):\n    # TODO: return True if some value occurs more than floor(len(nums) / 2) times\n    pass\n',
      javascript:
        'function hasMajority(nums) {\n    // TODO: return true if some value occurs more than Math.floor(nums.length / 2) times\n}\n',
    },
    sampleTestcases: [
      {
        inputs: [[3, 3, 4, 2, 3, 3, 3]],
        expected: true,
        explanation: 'n=7, threshold floor(7/2)=3; value 3 appears 5 times which is more than 3.',
      },
      {
        inputs: [[1, 2, 3, 4]],
        expected: false,
        explanation: 'n=4, threshold floor(4/2)=2; no value appears more than twice.',
      },
    ],
    hiddenTestcases: [
      {
        inputs: [[]],
        expected: false,
        explanation: 'Empty array has no dominant value.',
      },
      {
        inputs: [[7]],
        expected: true,
        explanation: 'n=1, threshold floor(1/2)=0; the single element appears once, more than 0.',
      },
      {
        inputs: [[5, 5]],
        expected: true,
        explanation: 'n=2, threshold 1; value 5 appears twice, more than 1.',
      },
      {
        inputs: [[5, 6]],
        expected: false,
        explanation: 'n=2, threshold 1; each value appears once, not more than 1.',
      },
      {
        inputs: [[2, 2, 1, 1, 1, 2, 2]],
        expected: true,
        explanation:
          'n=7, threshold 3; the Boyer-Moore candidate flips mid-scan but 2 appears 4 times, clearing 3.',
      },
      {
        inputs: [[-1, -1, -1, 2, 3]],
        expected: true,
        explanation: 'n=5, threshold 2; value -1 appears 3 times, more than 2.',
      },
      {
        inputs: [[0, 0, 1, 1]],
        expected: false,
        explanation:
          'n=4, threshold 2; each value appears exactly 2 times, which is not strictly greater than 2.',
      },
      {
        inputs: [[9, 9, 9, 9, 9, 9, 1, 2, 3, 4]],
        expected: true,
        explanation: 'n=10, threshold 5; value 9 appears 6 times, more than 5.',
      },
    ],
  },
  {
    slug: 'edit-distance',
    title: 'Edit Distance',
    statementMarkdown:
      'A collaborative text editor logs how much a draft changed between two saves. The "revision cost" is the fewest single-character edits needed to transform one version into another, where each edit is one of:\n\n- **Insert** a single character,\n- **Delete** a single character, or\n- **Substitute** one character for another.\n\nGiven two lowercase strings `a` and `b`, return the minimum number of such edits needed to turn `a` into `b`. This quantity is also known as the Levenshtein distance.\n\n## Examples\n\n### Example 1\n- Input: `a = "mint"`, `b = "mind"`\n- Output: `1`\n- Explanation: Substitute the final `t` with `d` to get `mind`. One edit is enough.\n\n### Example 2\n- Input: `a = "glove"`, `b = "love"`\n- Output: `1`\n- Explanation: Delete the leading `g` to get `love`. One edit is enough.\n\n## Constraints\n- `0 <= a.length, b.length <= 1000`\n- `a` and `b` consist only of lowercase English letters (`a`-`z`).\n- Either string may be empty.',
    difficulty: 'hard',
    tags: ['dynamic-programming', 'strings'],
    companies: ['Hooli', 'Initech'],
    functionName: 'editDistance',
    ioSpec: {
      params: [
        {
          name: 'a',
          type: 'string',
        },
        {
          name: 'b',
          type: 'string',
        },
      ],
      returns: 'int',
    },
    referenceSolution: {
      python:
        'def editDistance(a, b):\n    n, m = len(a), len(b)\n    dp = [[0] * (m + 1) for _ in range(n + 1)]\n    for i in range(n + 1):\n        dp[i][0] = i\n    for j in range(m + 1):\n        dp[0][j] = j\n    for i in range(1, n + 1):\n        for j in range(1, m + 1):\n            if a[i - 1] == b[j - 1]:\n                dp[i][j] = dp[i - 1][j - 1]\n            else:\n                dp[i][j] = 1 + min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1])\n    return dp[n][m]\n',
      javascript:
        'function editDistance(a, b) {\n  const n = a.length, m = b.length;\n  const dp = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));\n  for (let i = 0; i <= n; i++) dp[i][0] = i;\n  for (let j = 0; j <= m; j++) dp[0][j] = j;\n  for (let i = 1; i <= n; i++) {\n    for (let j = 1; j <= m; j++) {\n      if (a[i - 1] === b[j - 1]) {\n        dp[i][j] = dp[i - 1][j - 1];\n      } else {\n        dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);\n      }\n    }\n  }\n  return dp[n][m];\n}\n',
    },
    starterCode: {
      python:
        'def editDistance(a, b):\n    # TODO: return the minimum number of insert/delete/substitute edits\n    # needed to transform string a into string b.\n    pass\n',
      javascript:
        'function editDistance(a, b) {\n  // TODO: return the minimum number of insert/delete/substitute edits\n  // needed to transform string a into string b.\n}\n',
    },
    sampleTestcases: [
      {
        inputs: ['mint', 'mind'],
        expected: 1,
        explanation: 'Substitute the last character t with d.',
      },
      {
        inputs: ['glove', 'love'],
        expected: 1,
        explanation: 'Delete the leading g.',
      },
    ],
    hiddenTestcases: [
      {
        inputs: ['', ''],
        expected: 0,
        explanation: 'Both empty; no edits required.',
      },
      {
        inputs: ['', 'spark'],
        expected: 5,
        explanation: 'Insert all 5 characters.',
      },
      {
        inputs: ['cloud', ''],
        expected: 5,
        explanation: 'Delete all 5 characters.',
      },
      {
        inputs: ['photon', 'photon'],
        expected: 0,
        explanation: 'Identical strings need no edits.',
      },
      {
        inputs: ['a', 'b'],
        expected: 1,
        explanation: 'Single substitution.',
      },
      {
        inputs: ['aaaa', 'aa'],
        expected: 2,
        explanation: 'Delete two of the repeated characters.',
      },
      {
        inputs: ['abcdef', 'azcef'],
        expected: 2,
        explanation: 'Substitute b with z and delete d.',
      },
      {
        inputs: ['distance', 'instances'],
        expected: 3,
        explanation: 'A larger mixed case combining insertions and substitutions.',
      },
    ],
  },
  {
    slug: 'longest-increasing-length',
    title: 'Longest Increasing Subsequence Length',
    statementMarkdown:
      'A trail-camera logs the elevation (in metres) of a hiker at successive checkpoints in the array `nums`. The park ranger wants to know the length of the longest **strictly increasing** run of elevations the hiker could have climbed through, where the chosen checkpoints do **not** need to be next to each other in the log — only their relative order must be preserved.\n\nFormally, return the length of the longest strictly increasing subsequence of `nums`. A *subsequence* is obtained by deleting zero or more elements without changing the order of the remaining ones. *Strictly increasing* means each chosen value is greater than the one before it. If `nums` is empty, return `0`.\n\n## Examples\n\n### Example 1\n- Input: `nums = [3, 1, 4, 1, 5, 9, 2, 6]`\n- Output: `4`\n- Explanation: One longest strictly increasing subsequence is `[1, 4, 5, 9]` (also `[1, 4, 5, 6]`), which has length 4. No strictly increasing subsequence of length 5 exists.\n\n### Example 2\n- Input: `nums = [5, 4, 3, 2, 1]`\n- Output: `1`\n- Explanation: The values only decrease, so the best you can do is pick a single element, giving length 1.\n\n## Constraints\n- `0 <= nums.length <= 100000`\n- `-1000000000 <= nums[i] <= 1000000000`\n- Equal values may repeat; because the run must be **strictly** increasing, repeated values cannot both be chosen.',
    difficulty: 'hard',
    tags: ['dynamic-programming', 'binary-search', 'arrays', 'greedy'],
    companies: ['Hooli', 'Globex'],
    functionName: 'longestIncreasingLength',
    ioSpec: {
      params: [
        {
          name: 'nums',
          type: {
            array: 'int',
          },
        },
      ],
      returns: 'int',
    },
    referenceSolution: {
      python:
        'import bisect\n\ndef longestIncreasingLength(nums):\n    tails = []\n    for x in nums:\n        i = bisect.bisect_left(tails, x)\n        if i == len(tails):\n            tails.append(x)\n        else:\n            tails[i] = x\n    return len(tails)\n',
      javascript:
        'function longestIncreasingLength(nums) {\n    const tails = [];\n    for (const x of nums) {\n        let lo = 0, hi = tails.length;\n        while (lo < hi) {\n            const mid = (lo + hi) >> 1;\n            if (tails[mid] < x) lo = mid + 1;\n            else hi = mid;\n        }\n        if (lo === tails.length) tails.push(x);\n        else tails[lo] = x;\n    }\n    return tails.length;\n}\n',
    },
    starterCode: {
      python:
        'def longestIncreasingLength(nums):\n    # TODO: return the length of the longest strictly increasing subsequence of nums\n    pass\n',
      javascript:
        'function longestIncreasingLength(nums) {\n    // TODO: return the length of the longest strictly increasing subsequence of nums\n}\n',
    },
    sampleTestcases: [
      {
        inputs: [[3, 1, 4, 1, 5, 9, 2, 6]],
        expected: 4,
        explanation: 'A longest strictly increasing subsequence is [1, 4, 5, 9] with length 4.',
      },
      {
        inputs: [[5, 4, 3, 2, 1]],
        expected: 1,
        explanation: 'Values only decrease, so a single element is the best, giving length 1.',
      },
    ],
    hiddenTestcases: [
      {
        inputs: [[]],
        expected: 0,
        explanation: 'Empty array has no elements, so the length is 0.',
      },
      {
        inputs: [[7]],
        expected: 1,
        explanation: 'A single element forms a strictly increasing subsequence of length 1.',
      },
      {
        inputs: [[2, 2, 2, 2]],
        expected: 1,
        explanation:
          'All values are equal; strict increase forbids repeats, so only one can be chosen.',
      },
      {
        inputs: [[-1, -2, 0, -3, 2]],
        expected: 3,
        explanation:
          'The subsequence [-2, 0, 2] (or [-3, 0, 2]) is strictly increasing with length 3.',
      },
      {
        inputs: [[1, 3, 2, 3, 4, 1, 5]],
        expected: 5,
        explanation: 'The subsequence [1, 2, 3, 4, 5] is strictly increasing with length 5.',
      },
      {
        inputs: [[1, 2, 3, 4, 5, 6]],
        expected: 6,
        explanation: 'The whole array is already strictly increasing, length 6.',
      },
      {
        inputs: [[10, 9, 2, 5, 3, 7, 101, 18, 4, 8, 6]],
        expected: 4,
        explanation:
          'A longest strictly increasing subsequence such as [2, 3, 7, 101] has length 4.',
      },
      {
        inputs: [[4, 4, 4, 3, 5, 5, 6]],
        expected: 3,
        explanation:
          'The subsequence [3, 5, 6] is strictly increasing with length 3; duplicate 4s and 5s cannot both be used.',
      },
    ],
  },
  {
    slug: 'longest-k-distinct',
    title: 'Longest Substring With K Distinct',
    statementMarkdown:
      'You are given a string `s` and an integer `k`. Return the length of the longest contiguous block of characters in `s` that uses **at most** `k` distinct characters.\n\nA contiguous block (substring) is any run of consecutive characters taken from `s`. If `s` is empty or `k` is `0`, no valid block can exist, so the answer is `0`.\n\n## Examples\n\n**Example 1**\n\n- Input: `s = "banana"`, `k = 2`\n- Output: `5`\n- Explanation: The block `"anana"` uses only the two characters `a` and `n`. No longer block stays within 2 distinct characters.\n\n**Example 2**\n\n- Input: `s = "abcba"`, `k = 2`\n- Output: `3`\n- Explanation: The block `"bcb"` uses just `b` and `c`. Any block of length 4 would require at least 3 distinct characters.\n\n## Constraints\n\n- `0 <= s.length <= 100000`\n- `s` consists of lowercase English letters only.\n- `0 <= k <= 26`\n- The answer is the length of the best block, or `0` when no valid block exists.',
    difficulty: 'medium',
    tags: ['sliding-window', 'hashing', 'strings'],
    companies: ['Globex', 'Hooli'],
    functionName: 'longestKDistinct',
    ioSpec: {
      params: [
        {
          name: 's',
          type: 'string',
        },
        {
          name: 'k',
          type: 'int',
        },
      ],
      returns: 'int',
    },
    referenceSolution: {
      python:
        'from collections import defaultdict\n\ndef longestKDistinct(s, k):\n    if k <= 0 or not s:\n        return 0\n    count = defaultdict(int)\n    left = 0\n    best = 0\n    distinct = 0\n    for right in range(len(s)):\n        c = s[right]\n        if count[c] == 0:\n            distinct += 1\n        count[c] += 1\n        while distinct > k:\n            lc = s[left]\n            count[lc] -= 1\n            if count[lc] == 0:\n                distinct -= 1\n            left += 1\n        if right - left + 1 > best:\n            best = right - left + 1\n    return best\n',
      javascript:
        'function longestKDistinct(s, k) {\n    if (k <= 0 || s.length === 0) return 0;\n    const count = new Map();\n    let left = 0;\n    let best = 0;\n    let distinct = 0;\n    for (let right = 0; right < s.length; right++) {\n        const c = s[right];\n        const cur = count.get(c) || 0;\n        if (cur === 0) distinct++;\n        count.set(c, cur + 1);\n        while (distinct > k) {\n            const lc = s[left];\n            const lcCount = count.get(lc) - 1;\n            count.set(lc, lcCount);\n            if (lcCount === 0) distinct--;\n            left++;\n        }\n        if (right - left + 1 > best) best = right - left + 1;\n    }\n    return best;\n}\n',
    },
    starterCode: {
      python:
        'def longestKDistinct(s, k):\n    # TODO: Return the length of the longest substring of s\n    # containing at most k distinct characters.\n    pass\n',
      javascript:
        'function longestKDistinct(s, k) {\n    // TODO: Return the length of the longest substring of s\n    // containing at most k distinct characters.\n}\n',
    },
    sampleTestcases: [
      {
        inputs: ['banana', 2],
        expected: 5,
        explanation:
          "\"anana\" uses only 'a' and 'n', giving the longest window within 2 distinct characters.",
      },
      {
        inputs: ['abcba', 2],
        expected: 3,
        explanation:
          "\"bcb\" uses 'b' and 'c'; no length-4 block stays within 2 distinct characters.",
      },
    ],
    hiddenTestcases: [
      {
        inputs: ['', 3],
        expected: 0,
        explanation: 'Empty string has no characters, so the answer is 0.',
      },
      {
        inputs: ['abc', 0],
        expected: 0,
        explanation: 'With k = 0 no character may appear, so no block is valid.',
      },
      {
        inputs: ['a', 2],
        expected: 1,
        explanation:
          'Single character; k exceeds the number of distinct characters, so the whole string qualifies.',
      },
      {
        inputs: ['aabbcc', 1],
        expected: 2,
        explanation:
          'With only 1 distinct character allowed, the best runs are pairs like "aa", "bb", or "cc".',
      },
      {
        inputs: ['aaaa', 1],
        expected: 4,
        explanation:
          'All characters are identical, so the entire string uses just 1 distinct character.',
      },
      {
        inputs: ['abaccc', 2],
        expected: 4,
        explanation: "\"accc\" uses 'a' and 'c' for a length-4 window.",
      },
      {
        inputs: ['mississippi', 2],
        expected: 7,
        explanation: "The window \"ississi\" uses only 'i' and 's' for length 7.",
      },
      {
        inputs: ['abcdef', 10],
        expected: 6,
        explanation:
          'k is larger than the number of distinct characters, so the whole string qualifies.',
      },
    ],
  },
  {
    slug: 'knapsack-max-value',
    title: '0/1 Knapsack Maximum Value',
    statementMarkdown:
      'A courier robot is loading a delivery drone. There are `n` parcels; parcel `i` has a weight `weights[i]` and a payout `values[i]`. The drone can carry a total weight of at most `capacity`. Each parcel is either loaded whole or left behind — you cannot split a parcel, and each may be loaded at most once.\n\nReturn the **maximum total payout** the robot can achieve by choosing a subset of parcels whose combined weight does not exceed `capacity`.\n\nThe lengths of `weights` and `values` are always equal.\n\n## Examples\n\n### Example 1\n- Input: `weights = [1, 2, 3]`, `values = [6, 10, 12]`, `capacity = 5`\n- Output: `22`\n- Explanation: Loading parcels 1 and 2 (weights `2 + 3 = 5`) fits exactly and yields payout `10 + 12 = 22`. No other in-capacity subset pays more.\n\n### Example 2\n- Input: `weights = [2, 3, 4, 5]`, `values = [3, 4, 5, 6]`, `capacity = 5`\n- Output: `7`\n- Explanation: Parcels 0 and 1 have combined weight `2 + 3 = 5` and payout `3 + 4 = 7`, which beats taking any single parcel.\n\n## Constraints\n- `0 <= n <= 200` where `n` is the length of `weights` (and of `values`).\n- `weights.length == values.length`.\n- `0 <= weights[i] <= 1000`.\n- `0 <= values[i] <= 1000`.\n- `0 <= capacity <= 2000`.',
    difficulty: 'hard',
    tags: ['dynamic-programming'],
    companies: ['Globex', 'Initech'],
    functionName: 'knapsackMaxValue',
    ioSpec: {
      params: [
        {
          name: 'weights',
          type: {
            array: 'int',
          },
        },
        {
          name: 'values',
          type: {
            array: 'int',
          },
        },
        {
          name: 'capacity',
          type: 'int',
        },
      ],
      returns: 'int',
    },
    referenceSolution: {
      python:
        'def knapsackMaxValue(weights, values, capacity):\n    dp = [0] * (capacity + 1)\n    for i in range(len(weights)):\n        w = weights[i]\n        v = values[i]\n        for c in range(capacity, w - 1, -1):\n            cand = dp[c - w] + v\n            if cand > dp[c]:\n                dp[c] = cand\n    return dp[capacity]\n',
      javascript:
        'function knapsackMaxValue(weights, values, capacity) {\n  const dp = new Array(capacity + 1).fill(0);\n  for (let i = 0; i < weights.length; i++) {\n    const w = weights[i];\n    const v = values[i];\n    for (let c = capacity; c >= w; c--) {\n      const cand = dp[c - w] + v;\n      if (cand > dp[c]) dp[c] = cand;\n    }\n  }\n  return dp[capacity];\n}\n',
    },
    starterCode: {
      python:
        'def knapsackMaxValue(weights, values, capacity):\n    # TODO: use a 1D DP over capacity, iterating capacity in decreasing order\n    # so each item is counted at most once. Return the best achievable payout.\n    pass\n',
      javascript:
        'function knapsackMaxValue(weights, values, capacity) {\n  // TODO: use a 1D DP over capacity, iterating capacity in decreasing order\n  // so each item is counted at most once. Return the best achievable payout.\n}\n',
    },
    sampleTestcases: [
      {
        inputs: [[1, 2, 3], [6, 10, 12], 5],
        expected: 22,
        explanation: 'Parcels 1 and 2 weigh 5 total and pay 10 + 12 = 22.',
      },
      {
        inputs: [[2, 3, 4, 5], [3, 4, 5, 6], 5],
        expected: 7,
        explanation: 'Parcels 0 and 1 weigh 5 total and pay 3 + 4 = 7.',
      },
    ],
    hiddenTestcases: [
      {
        inputs: [[10], [100], 5],
        expected: 0,
        explanation: 'The only parcel (weight 10) exceeds capacity 5, so nothing can be loaded.',
      },
      {
        inputs: [[], [], 10],
        expected: 0,
        explanation: 'No parcels available, payout is 0.',
      },
      {
        inputs: [[1, 2], [5, 6], 0],
        expected: 0,
        explanation: 'Capacity 0 means no parcel fits.',
      },
      {
        inputs: [[1, 1, 1], [4, 5, 6], 3],
        expected: 15,
        explanation: 'All three parcels fit (total weight 3) for payout 4 + 5 + 6 = 15.',
      },
      {
        inputs: [[2, 2, 2], [3, 3, 3], 4],
        expected: 6,
        explanation: 'At most two identical parcels fit within capacity 4, paying 3 + 3 = 6.',
      },
      {
        inputs: [[5, 4, 6, 3, 2, 7, 1], [10, 40, 30, 50, 35, 20, 15], 10],
        expected: 140,
        explanation:
          'Loading parcels of weight 4, 3, 2, 1 uses capacity 10 exactly for payout 40 + 50 + 35 + 15 = 140.',
      },
      {
        inputs: [[3, 8, 6, 2], [5, 12, 9, 3], 7],
        expected: 9,
        explanation:
          'The single weight-6 parcel (payout 9) beats any other in-capacity combination.',
      },
      {
        inputs: [[4], [9], 4],
        expected: 9,
        explanation: 'The parcel fits capacity exactly, giving payout 9.',
      },
    ],
  },
  {
    slug: 'longest-common-subseq',
    title: 'Longest Common Subsequence Length',
    statementMarkdown:
      'Two delivery drones each fly their own route and log the sequence of beacon codes they pass, one letter per beacon. Route logs are recorded as the strings `a` and `b`. Analysts want to know how much of the journey the two drones shared, even if the shared beacons were not passed back-to-back.\n\nA **common subsequence** is a string that can be obtained from *both* `a` and `b` by deleting zero or more characters without reordering the remaining characters. Return the **length** of the longest such common subsequence.\n\nMatching is case-sensitive: `\'A\'` and `\'a\'` are different beacon codes.\n\n## Examples\n\n### Example 1\n- Input: `a = "PLANET"`, `b = "PLATE"`\n- Output: `4`\n- Explanation: `"PLAT"` appears in order inside both logs (`PLA…T` in `a` and `PLAT` in `b`). No common subsequence of length 5 exists, so the answer is 4.\n\n### Example 2\n- Input: `a = "HELLO"`, `b = "WORLD"`\n- Output: `1`\n- Explanation: The logs share letters like `L` and `O`, but they occur in conflicting orders, so no common subsequence uses more than one letter. The longest common subsequence has length 1.\n\n## Constraints\n- `0 <= a.length <= 1000`\n- `0 <= b.length <= 1000`\n- `a` and `b` consist of upper- and lower-case English letters only.\n- Either string may be empty; if either is empty the answer is `0`.',
    difficulty: 'hard',
    tags: ['dynamic-programming', 'strings'],
    companies: ['Globex', 'Hooli'],
    functionName: 'longestCommonSubseq',
    ioSpec: {
      params: [
        {
          name: 'a',
          type: 'string',
        },
        {
          name: 'b',
          type: 'string',
        },
      ],
      returns: 'int',
    },
    referenceSolution: {
      python:
        'def longestCommonSubseq(a, b):\n    m, n = len(a), len(b)\n    dp = [[0] * (n + 1) for _ in range(m + 1)]\n    for i in range(1, m + 1):\n        for j in range(1, n + 1):\n            if a[i - 1] == b[j - 1]:\n                dp[i][j] = dp[i - 1][j - 1] + 1\n            else:\n                dp[i][j] = max(dp[i - 1][j], dp[i][j - 1])\n    return dp[m][n]\n',
      javascript:
        'function longestCommonSubseq(a, b) {\n  const m = a.length, n = b.length;\n  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));\n  for (let i = 1; i <= m; i++) {\n    for (let j = 1; j <= n; j++) {\n      if (a[i - 1] === b[j - 1]) {\n        dp[i][j] = dp[i - 1][j - 1] + 1;\n      } else {\n        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);\n      }\n    }\n  }\n  return dp[m][n];\n}\n',
    },
    starterCode: {
      python:
        'def longestCommonSubseq(a, b):\n    # TODO: return the length of the longest common subsequence of a and b\n    pass\n',
      javascript:
        'function longestCommonSubseq(a, b) {\n  // TODO: return the length of the longest common subsequence of a and b\n}\n',
    },
    sampleTestcases: [
      {
        inputs: ['PLANET', 'PLATE'],
        expected: 4,
        explanation: '"PLAT" is a subsequence of both logs; nothing longer is common.',
      },
      {
        inputs: ['HELLO', 'WORLD'],
        expected: 1,
        explanation:
          'Shared letters appear in conflicting orders, so the longest common subsequence has length 1.',
      },
    ],
    hiddenTestcases: [
      {
        inputs: ['', ''],
        expected: 0,
        explanation: 'Both logs empty.',
      },
      {
        inputs: ['', 'beacon'],
        expected: 0,
        explanation: 'One log empty gives no common characters.',
      },
      {
        inputs: ['k', 'k'],
        expected: 1,
        explanation: 'Single matching beacon.',
      },
      {
        inputs: ['k', 'm'],
        expected: 0,
        explanation: 'Single non-matching beacon.',
      },
      {
        inputs: ['zzzz', 'zz'],
        expected: 2,
        explanation: 'Repeated identical beacons; the shorter run bounds the match.',
      },
      {
        inputs: ['abcbdab', 'bdcaba'],
        expected: 4,
        explanation:
          'Interleaved duplicates; a longest common subsequence such as "bdab" has length 4.',
      },
      {
        inputs: ['mississippi', 'misp'],
        expected: 4,
        explanation: '"misp" appears in order inside the longer log.',
      },
      {
        inputs: ['courierdrone', 'commanderroute'],
        expected: 7,
        explanation: 'Larger case; the longest common subsequence has length 7.',
      },
    ],
  },
  {
    slug: 'total-set-bits',
    title: 'Total Set Bits Up To N',
    statementMarkdown:
      "A monitoring dashboard represents each event id as a non-negative integer and lights up one indicator lamp for every `1` in that number's binary form. To size the power budget, you need the total number of lamps that ever light up while the id counter sweeps through every value from `0` to `n`.\n\nGiven a non-negative integer `n`, return the total count of set bits (binary `1` digits) across the binary representations of all integers from `0` to `n`, inclusive.\n\nA useful building block is that the popcount of any value `i` satisfies `bits(i) = bits(i >> 1) + (i & 1)`, so the running total grows predictably as `i` increases. Because the sweep can be wide, the accumulated count may exceed the range of a 32-bit integer, so the answer is returned as a 64-bit value.\n\n## Examples\n\n**Example 1**\n\nInput: `n = 5`\nOutput: `7`\nExplanation: In binary the values are 0, 1, 10, 11, 100, 101, whose set-bit counts are 0, 1, 1, 2, 1, 2. Their sum is 7.\n\n**Example 2**\n\nInput: `n = 3`\nOutput: `4`\nExplanation: The counts for 0, 1, 10, 11 are 0, 1, 1, 2, which add up to 4.\n\n## Constraints\n\n- `0 <= n <= 1000000000`\n- The returned total can be as large as roughly `1.5 * 10^10`, so it must be handled as a 64-bit (`long`) value.",
    difficulty: 'medium',
    tags: ['bit-manipulation', 'dynamic-programming', 'math'],
    companies: ['Hooli', 'Initech'],
    functionName: 'totalSetBits',
    ioSpec: {
      params: [
        {
          name: 'n',
          type: 'int',
        },
      ],
      returns: 'long',
    },
    referenceSolution: {
      python:
        'def totalSetBits(n):\n    if n < 0:\n        return 0\n    total = 0\n    bit = 1\n    while bit <= n:\n        cycle = bit * 2\n        full = (n + 1) // cycle\n        total += full * bit\n        rem = (n + 1) % cycle\n        total += max(0, rem - bit)\n        bit *= 2\n    return total\n',
      javascript:
        'function totalSetBits(n) {\n    if (n < 0) return 0;\n    let total = 0;\n    let bit = 1;\n    while (bit <= n) {\n        const cycle = bit * 2;\n        const full = Math.floor((n + 1) / cycle);\n        total += full * bit;\n        const rem = (n + 1) % cycle;\n        total += Math.max(0, rem - bit);\n        bit *= 2;\n    }\n    return total;\n}\n',
    },
    starterCode: {
      python:
        'def totalSetBits(n):\n    # TODO: return the total number of set bits across all integers from 0 to n inclusive.\n    pass\n',
      javascript:
        'function totalSetBits(n) {\n    // TODO: return the total number of set bits across all integers from 0 to n inclusive.\n    return 0;\n}\n',
    },
    sampleTestcases: [
      {
        inputs: [5],
        expected: 7,
        explanation: 'Set-bit counts for 0..5 are 0,1,1,2,1,2 summing to 7.',
      },
      {
        inputs: [3],
        expected: 4,
        explanation: 'Set-bit counts for 0..3 are 0,1,1,2 summing to 4.',
      },
    ],
    hiddenTestcases: [
      {
        inputs: [0],
        expected: 0,
        explanation: 'Only the value 0, which has no set bits.',
      },
      {
        inputs: [1],
        expected: 1,
        explanation: 'Counts for 0 and 1 are 0 and 1.',
      },
      {
        inputs: [2],
        expected: 2,
        explanation: 'Counts for 0,1,2 are 0,1,1.',
      },
      {
        inputs: [8],
        expected: 13,
        explanation: 'Counts for 0..8 sum to 13; the power of two 8 (1000) adds a single bit.',
      },
      {
        inputs: [16],
        expected: 33,
        explanation: 'Counts for 0..16 sum to 33.',
      },
      {
        inputs: [1023],
        expected: 5120,
        explanation:
          '1023 is all ten bits set; the range 0..1023 contains 512 set bits per position across 10 positions.',
      },
      {
        inputs: [1000000],
        expected: 9884999,
        explanation: 'A mid-size sweep; still within 32-bit range.',
      },
      {
        inputs: [1000000000],
        expected: 14846928141,
        explanation: 'Large sweep whose total exceeds 2^31, requiring a 64-bit result.',
      },
    ],
  },
  {
    slug: 'min-increments-unique',
    title: 'Minimum Increments to Make Unique',
    statementMarkdown:
      "An engineering team calibrates a rack of sensors. Each sensor stores an integer offset, given in `nums`. Two sensors that share the same offset interfere with each other, so every offset must end up distinct.\n\nThe calibration tool can only **nudge** a sensor's offset **up by exactly 1** per action. You may nudge any sensor any number of times. Return the **minimum total number of nudges** needed so that all offsets in `nums` become distinct.\n\n## Examples\n\n**Example 1**\n\n```\nInput:  nums = [2, 1, 2]\nOutput: 1\n```\n\nExplanation: The two sensors with offset `2` collide. Nudge one of them up to `3`, giving `[2, 1, 3]` — all distinct. That is 1 nudge.\n\n**Example 2**\n\n```\nInput:  nums = [3, 2, 1, 2, 1, 7]\nOutput: 6\n```\n\nExplanation: Sorted, the offsets are `[1, 1, 2, 2, 3, 7]`. Raising each colliding value to the next free slot gives `[1, 2, 3, 4, 5, 7]`. The nudges are `1 + 1 + 2 + 2 = 6`.\n\n## Constraints\n\n- `0 <= nums.length <= 10^5`\n- `-10^9 <= nums[i] <= 10^9`\n- Offsets may be negative and may repeat.\n- The total number of nudges can exceed the range of a 32-bit integer, so return a 64-bit value.",
    difficulty: 'medium',
    tags: ['greedy', 'sorting'],
    companies: ['Globex', 'Hooli'],
    functionName: 'minIncrementsUnique',
    ioSpec: {
      params: [
        {
          name: 'nums',
          type: {
            array: 'int',
          },
        },
      ],
      returns: 'long',
    },
    referenceSolution: {
      python:
        'def minIncrementsUnique(nums):\n    nums = sorted(nums)\n    total = 0\n    prev = None\n    for x in nums:\n        if prev is None:\n            prev = x\n        elif x <= prev:\n            prev += 1\n            total += prev - x\n        else:\n            prev = x\n    return total\n',
      javascript:
        'function minIncrementsUnique(nums) {\n  const a = nums.slice().sort((x, y) => x - y);\n  let total = 0;\n  let prev = null;\n  for (const x of a) {\n    if (prev === null) {\n      prev = x;\n    } else if (x <= prev) {\n      prev = prev + 1;\n      total += prev - x;\n    } else {\n      prev = x;\n    }\n  }\n  return total;\n}\n',
    },
    starterCode: {
      python:
        'def minIncrementsUnique(nums):\n    # TODO: sort nums, then greedily raise each colliding value\n    # to one more than the previous kept value, summing the increments.\n    pass\n',
      javascript:
        'function minIncrementsUnique(nums) {\n  // TODO: sort nums, then greedily raise each colliding value\n  // to one more than the previous kept value, summing the increments.\n}\n',
    },
    sampleTestcases: [
      {
        inputs: [[2, 1, 2]],
        expected: 1,
        explanation:
          'The two sensors with offset 2 collide; nudge one up to 3, giving [1, 2, 3]. One nudge.',
      },
      {
        inputs: [[3, 2, 1, 2, 1, 7]],
        expected: 6,
        explanation: 'Sorted [1,1,2,2,3,7] becomes [1,2,3,4,5,7]; total nudges 1+1+2+2 = 6.',
      },
    ],
    hiddenTestcases: [
      {
        inputs: [[]],
        expected: 0,
        explanation: 'No sensors, so no nudges are needed.',
      },
      {
        inputs: [[7]],
        expected: 0,
        explanation: 'A single offset is already distinct.',
      },
      {
        inputs: [[1, 1, 1]],
        expected: 3,
        explanation: 'Raise to 1, 2, 3: nudges 0 + 1 + 2 = 3.',
      },
      {
        inputs: [[-2, -2, -1]],
        expected: 2,
        explanation: 'Negative offsets become -2, -1, 0: nudges 1 + 1 = 2.',
      },
      {
        inputs: [[0, 0, 0, 0]],
        expected: 6,
        explanation: 'Become 0, 1, 2, 3: nudges 0 + 1 + 2 + 3 = 6.',
      },
      {
        inputs: [[1, 2, 3, 4, 5]],
        expected: 0,
        explanation: 'All offsets are already distinct.',
      },
      {
        inputs: [[5, 5, 5, 4, 4, 3]],
        expected: 7,
        explanation: 'Sorted [3,4,4,5,5,5] becomes [3,4,5,6,7,8]; total nudges 1+1+2+3 = 7.',
      },
      {
        inputs: [
          [
            20, 3, 0, 8, 7, 7, 4, 3, 17, 2, 18, 13, 1, 0, 2, 6, 7, 16, 19, 0, 17, 6, 20, 17, 13, 7,
            14, 18, 8, 0, 5, 13, 10, 8, 4, 6, 10, 3, 2, 12,
          ],
        ],
        expected: 434,
        explanation:
          'Larger mixed case with many duplicates; verified against both reference solutions.',
      },
    ],
  },
  {
    slug: 'largest-histogram-area',
    title: 'Biggest Rectangle Under the Skyline',
    statementMarkdown:
      'A city skyline is modeled as a histogram: a row of adjacent bars, each exactly one unit wide, standing side by side. The array `heights` gives the height of each bar from left to right, where `heights[i]` is the height of the bar at position `i`.\n\nConsider every axis-aligned rectangle that fits **entirely** under the outline of the histogram (its bottom sits on the ground, and it never rises above any bar it covers). Return the **maximum area** among all such rectangles.\n\nA rectangle spanning bars from index `l` to index `r` (inclusive) has width `r - l + 1` and can rise no higher than the shortest bar in that range, so its area is `(r - l + 1) * min(heights[l..r])`. If `heights` is empty, the answer is `0`.\n\nBecause the width and the tallest bars can both be large, the area may exceed the range of a 32-bit integer; return the result as a 64-bit value.\n\n## Examples\n\n### Example 1\n- Input: `heights = [2, 5, 5, 3, 1]`\n- Output: `10`\n- Explanation: The bars at indices 1 and 2 both have height 5. A rectangle covering just these two bars has width 2 and height `min(5, 5) = 5`, giving area `2 * 5 = 10`. No wider or taller rectangle beats it.\n\n### Example 2\n- Input: `heights = [3, 6]`\n- Output: `6`\n- Explanation: The single bar of height 6 gives area `1 * 6 = 6`. Covering both bars gives width 2 and height `min(3, 6) = 3`, also area 6. The maximum is 6.\n\n## Constraints\n- `0 <= heights.length <= 100000`\n- `0 <= heights[i] <= 1000000000`\n- The returned area fits in a 64-bit signed integer.',
    difficulty: 'hard',
    tags: ['stack', 'arrays'],
    companies: ['Hooli', 'Initech'],
    functionName: 'largestHistogramArea',
    ioSpec: {
      params: [
        {
          name: 'heights',
          type: {
            array: 'int',
          },
        },
      ],
      returns: 'long',
    },
    referenceSolution: {
      python:
        'def largestHistogramArea(heights):\n    stack = []\n    best = 0\n    n = len(heights)\n    for i in range(n + 1):\n        cur = heights[i] if i < n else 0\n        while stack and heights[stack[-1]] > cur:\n            h = heights[stack.pop()]\n            w = i if not stack else i - stack[-1] - 1\n            area = h * w\n            if area > best:\n                best = area\n        stack.append(i)\n    return best\n',
      javascript:
        'function largestHistogramArea(heights) {\n  const stack = [];\n  let best = 0;\n  const n = heights.length;\n  for (let i = 0; i <= n; i++) {\n    const cur = i < n ? heights[i] : 0;\n    while (stack.length && heights[stack[stack.length - 1]] > cur) {\n      const h = heights[stack.pop()];\n      const w = stack.length === 0 ? i : i - stack[stack.length - 1] - 1;\n      const area = h * w;\n      if (area > best) best = area;\n    }\n    stack.push(i);\n  }\n  return best;\n}\n',
    },
    starterCode: {
      python:
        'def largestHistogramArea(heights):\n    # TODO: return the maximum rectangle area under the histogram.\n    # Hint: a monotonic increasing stack of indices runs in O(n).\n    pass\n',
      javascript:
        'function largestHistogramArea(heights) {\n  // TODO: return the maximum rectangle area under the histogram.\n  // Hint: a monotonic increasing stack of indices runs in O(n).\n}\n',
    },
    sampleTestcases: [
      {
        inputs: [[2, 5, 5, 3, 1]],
        expected: 10,
        explanation:
          'Bars at indices 1 and 2 (both height 5) form a 2-wide, 5-tall rectangle: area 10.',
      },
      {
        inputs: [[3, 6]],
        expected: 6,
        explanation:
          'The single bar of height 6 gives area 6, matching the 2-wide, 3-tall rectangle.',
      },
    ],
    hiddenTestcases: [
      {
        inputs: [[]],
        expected: 0,
        explanation: 'Empty histogram has no rectangle, so the area is 0.',
      },
      {
        inputs: [[7]],
        expected: 7,
        explanation: 'A single bar: width 1, height 7, area 7.',
      },
      {
        inputs: [[3, 3, 3, 3]],
        expected: 12,
        explanation: 'All equal: the full span of width 4 and height 3 gives area 12.',
      },
      {
        inputs: [[0, 0]],
        expected: 0,
        explanation: 'All bars have zero height, so every rectangle has zero area.',
      },
      {
        inputs: [[5, 4, 3, 2, 1]],
        expected: 9,
        explanation: 'Height 3 over the first three bars gives width 3, area 9, which is the best.',
      },
      {
        inputs: [[1, 2, 3, 4, 5]],
        expected: 9,
        explanation: 'Height 3 over the last three bars gives width 3, area 9, which is the best.',
      },
      {
        inputs: [[6, 2, 5, 4, 5, 1, 6]],
        expected: 12,
        explanation:
          'Bars at indices 2,3,4 (heights 5,4,5) form a 3-wide, 4-tall rectangle: area 12.',
      },
      {
        inputs: [[1000000000, 1000000000, 1000000000]],
        expected: 3000000000,
        explanation:
          'Width 3 times height 1e9 equals 3e9, which exceeds 32-bit range and requires a 64-bit result.',
      },
    ],
  },
  {
    slug: 'trapped-water-total',
    title: 'Trapped Rain Water',
    statementMarkdown:
      "A city drainage team models a street's skyline as an elevation map. You are given an array `heights` where each entry is the height of a solid vertical bar (each bar has width 1). After a heavy storm, water collects in the dips between taller bars.\n\nReturn the **total units of water** that remain trapped once the rain stops. A position holds water only if there are taller (or equally tall) bars on both its left and its right; the water level above that position equals the shorter of the tallest bar to its left and the tallest bar to its right, minus the position's own height. Water that has no taller barrier on one side simply drains away.\n\nBecause the map can be wide and the bars tall, the total may exceed the range of a 32-bit integer, so the answer is a `long`.\n\n## Examples\n\n### Example 1\n- Input: `heights = [3, 0, 2, 0, 4]`\n- Output: `7`\n- Explanation: The tallest bar to the left of every interior dip is 3 and to the right is 4, so the water level across the interior is capped at 3. The dips hold `3` (over the first 0), `1` (over the 2), and `3` (over the second 0), for a total of `3 + 1 + 3 = 7`.\n\n### Example 2\n- Input: `heights = [4, 2, 0, 3, 2, 5]`\n- Output: `9`\n- Explanation: With a wall of height 4 on the far left and 5 on the far right, every interior position is capped at 4. The trapped amounts are `2 + 4 + 1 + 2 = 9`.\n\n## Constraints\n- `0 <= heights.length <= 100000`\n- `0 <= heights[i] <= 1000000000`\n- The returned total can be as large as about `10^14`, so use 64-bit arithmetic.",
    difficulty: 'hard',
    tags: ['two-pointers', 'arrays'],
    companies: ['Acme', 'Hooli'],
    functionName: 'trappedWater',
    ioSpec: {
      params: [
        {
          name: 'heights',
          type: {
            array: 'int',
          },
        },
      ],
      returns: 'long',
    },
    referenceSolution: {
      python:
        'def trappedWater(heights):\n    left, right = 0, len(heights) - 1\n    leftMax = 0\n    rightMax = 0\n    total = 0\n    while left < right:\n        if heights[left] < heights[right]:\n            if heights[left] >= leftMax:\n                leftMax = heights[left]\n            else:\n                total += leftMax - heights[left]\n            left += 1\n        else:\n            if heights[right] >= rightMax:\n                rightMax = heights[right]\n            else:\n                total += rightMax - heights[right]\n            right -= 1\n    return total\n',
      javascript:
        'function trappedWater(heights) {\n    let left = 0, right = heights.length - 1;\n    let leftMax = 0, rightMax = 0;\n    let total = 0;\n    while (left < right) {\n        if (heights[left] < heights[right]) {\n            if (heights[left] >= leftMax) {\n                leftMax = heights[left];\n            } else {\n                total += leftMax - heights[left];\n            }\n            left++;\n        } else {\n            if (heights[right] >= rightMax) {\n                rightMax = heights[right];\n            } else {\n                total += rightMax - heights[right];\n            }\n            right--;\n        }\n    }\n    return total;\n}\n',
    },
    starterCode: {
      python:
        'def trappedWater(heights):\n    # TODO: Track a running left-max and right-max with two pointers\n    # moving inward, and accumulate the trapped water at each step.\n    pass\n',
      javascript:
        'function trappedWater(heights) {\n    // TODO: Track a running left-max and right-max with two pointers\n    // moving inward, and accumulate the trapped water at each step.\n}\n',
    },
    sampleTestcases: [
      {
        inputs: [[3, 0, 2, 0, 4]],
        expected: 7,
        explanation: 'Interior water level is capped at min(3, 4) = 3, holding 3 + 1 + 3 = 7.',
      },
      {
        inputs: [[4, 2, 0, 3, 2, 5]],
        expected: 9,
        explanation: 'Walls of 4 and 5 cap the interior at 4, holding 2 + 4 + 1 + 2 = 9.',
      },
    ],
    hiddenTestcases: [
      {
        inputs: [[]],
        expected: 0,
        explanation: 'Empty map traps no water.',
      },
      {
        inputs: [[7]],
        expected: 0,
        explanation: 'A single bar has no enclosing walls.',
      },
      {
        inputs: [[1, 2, 3, 4, 5]],
        expected: 0,
        explanation: 'Strictly increasing: water always drains to the right.',
      },
      {
        inputs: [[5, 4, 3, 2, 1]],
        expected: 0,
        explanation: 'Strictly decreasing: water always drains to the left.',
      },
      {
        inputs: [[4, 4, 4, 4]],
        expected: 0,
        explanation: 'All equal heights leave no dips.',
      },
      {
        inputs: [[2, 0, 2]],
        expected: 2,
        explanation: 'A single dip capped at 2 holds 2 units over the 0.',
      },
      {
        inputs: [[5, 2, 1, 2, 1, 5]],
        expected: 14,
        explanation: 'Both walls are 5; the interior holds 3 + 4 + 3 + 4 = 14.',
      },
      {
        inputs: [[1000000000, 0, 0, 0, 1000000000]],
        expected: 3000000000,
        explanation:
          'Three positions each hold 10^9 units, totaling 3*10^9 which exceeds 32-bit range.',
      },
    ],
  },
  {
    slug: 'min-eating-speed',
    title: 'Minimum Eating Speed',
    statementMarkdown:
      'A night-shift warehouse robot must shred `piles` of packing foam before the morning crew arrives. Each entry in `piles` is the number of foam blocks in one pile.\n\nThe robot picks a single **shredding speed** `v` (blocks per hour) and keeps it fixed for the whole night. During any given hour the robot works on exactly one pile: it shreds up to `v` blocks from that pile. If a pile has fewer than `v` blocks left, it finishes that pile in the hour and idles for the rest of the hour rather than starting another pile. So a pile of size `p` costs exactly `ceil(p / v)` hours.\n\nYou are given the total number of `hours` available before the crew arrives. Return the **smallest** integer speed `v` such that the robot can finish every pile within `hours`. It is guaranteed that `hours` is at least the number of piles, so a valid speed always exists.\n\n## Examples\n\n### Example 1\nInput: `piles = [3, 6, 7, 11]`, `hours = 8`\nOutput: `4`\nExplanation: At speed `4` the piles cost `ceil(3/4)+ceil(6/4)+ceil(7/4)+ceil(11/4) = 1+2+2+3 = 8` hours, which fits. At speed `3` the cost is `1+2+3+4 = 10` hours, which is too slow, so `4` is the minimum.\n\n### Example 2\nInput: `piles = [30, 11, 23, 4, 20]`, `hours = 6`\nOutput: `23`\nExplanation: At speed `23` the cost is `2+1+1+1+1 = 6` hours (just in time). At speed `22` the cost rises to `2+1+2+1+1 = 7` hours, so `23` is the smallest workable speed.\n\n## Constraints\n- `1 <= piles.length <= 10^4`\n- `1 <= piles[i] <= 10^6`\n- `piles.length <= hours`\n- The answer is a positive integer in the range `[1, max(piles)]`.',
    difficulty: 'hard',
    tags: ['binary-search', 'greedy'],
    companies: ['Hooli', 'Initech'],
    functionName: 'minEatingSpeed',
    ioSpec: {
      params: [
        {
          name: 'piles',
          type: {
            array: 'int',
          },
        },
        {
          name: 'hours',
          type: 'int',
        },
      ],
      returns: 'int',
    },
    referenceSolution: {
      python:
        'def minEatingSpeed(piles, hours):\n    def hours_needed(v):\n        total = 0\n        for p in piles:\n            total += (p + v - 1) // v\n        return total\n\n    lo, hi = 1, max(piles)\n    while lo < hi:\n        mid = (lo + hi) // 2\n        if hours_needed(mid) <= hours:\n            hi = mid\n        else:\n            lo = mid + 1\n    return lo\n',
      javascript:
        'function minEatingSpeed(piles, hours) {\n    function hoursNeeded(v) {\n        let total = 0;\n        for (const p of piles) {\n            total += Math.floor((p + v - 1) / v);\n        }\n        return total;\n    }\n\n    let lo = 1, hi = Math.max(...piles);\n    while (lo < hi) {\n        const mid = Math.floor((lo + hi) / 2);\n        if (hoursNeeded(mid) <= hours) {\n            hi = mid;\n        } else {\n            lo = mid + 1;\n        }\n    }\n    return lo;\n}\n',
    },
    starterCode: {
      python:
        'def minEatingSpeed(piles, hours):\n    # TODO: return the smallest integer speed v such that\n    # sum(ceil(p / v) for p in piles) <= hours\n    pass\n',
      javascript:
        'function minEatingSpeed(piles, hours) {\n    // TODO: return the smallest integer speed v such that\n    // sum(ceil(p / v) for p in piles) <= hours\n}\n',
    },
    sampleTestcases: [
      {
        inputs: [[3, 6, 7, 11], 8],
        expected: 4,
        explanation: 'Speed 4 needs 1+2+2+3=8 hours; speed 3 needs 10, so 4 is minimal.',
      },
      {
        inputs: [[30, 11, 23, 4, 20], 6],
        expected: 23,
        explanation: 'Speed 23 needs 2+1+1+1+1=6 hours; speed 22 needs 7, so 23 is minimal.',
      },
    ],
    hiddenTestcases: [
      {
        inputs: [[1], 1],
        expected: 1,
        explanation: 'A single block finishes in one hour at speed 1, the smallest possible speed.',
      },
      {
        inputs: [[1000], 5],
        expected: 200,
        explanation: 'ceil(1000/200)=5 fits; ceil(1000/199)=6 does not, so 200 is minimal.',
      },
      {
        inputs: [[8, 8, 8, 8], 8],
        expected: 4,
        explanation: 'Speed 4 gives 2 hours per pile (total 8); speed 3 gives 3 each (total 12).',
      },
      {
        inputs: [[5, 2, 9, 3], 4],
        expected: 9,
        explanation:
          'hours equals the pile count, forcing one hour per pile, so v must equal max(piles)=9.',
      },
      {
        inputs: [[100, 200, 300, 400, 500, 600, 700, 800], 10],
        expected: 600,
        explanation: 'At 600 the total is 1+1+1+1+1+1+2+2=10; at 599 it rises to 11.',
      },
      {
        inputs: [[7, 7, 7, 7], 6],
        expected: 7,
        explanation:
          'Any speed below 7 needs 2 hours per pile (total 8>6); speed 7 needs only 4 hours.',
      },
      {
        inputs: [[13, 47, 25, 8], 10],
        expected: 12,
        explanation: 'At 12 the cost is 2+4+3+1=10; at 11 it becomes 2+5+3+1=11.',
      },
      {
        inputs: [[1000000, 1000000, 1000000], 3],
        expected: 1000000,
        explanation:
          'hours equals the pile count, so each pile must finish in one hour, giving v=1000000.',
      },
    ],
  },
  {
    slug: 'count-islands',
    title: 'Count Islands',
    statementMarkdown:
      "A survey drone scans a stretch of wetland and returns a rectangular map as `grid`. Each cell holds `1` for dry land or `0` for water. An **island** is a maximal group of land cells connected to one another through up, down, left, or right steps (diagonal touches do **not** connect land). Return the number of distinct islands on the map.\n\nIf `grid` has no rows (or no columns), there are no islands, so return `0`.\n\n## Examples\n\n### Example 1\nInput: `grid = [[1,1,0,0],[1,0,0,1],[0,0,1,1],[0,0,0,0]]`\n\nOutput: `2`\n\nExplanation: The top-left cluster `{(0,0),(0,1),(1,0)}` is one island. The cells `{(1,3),(2,3),(2,2)}` link through vertical and horizontal steps into a second island. Everything else is water.\n\n### Example 2\nInput: `grid = [[1,0,1],[0,1,0],[1,0,1]]`\n\nOutput: `5`\n\nExplanation: Each land cell only touches water in the four straight directions; the corner and center cells never connect (diagonals don't count), so all five land cells are separate islands.\n\n## Constraints\n- `0 <= number of rows <= 60`\n- `0 <= number of columns <= 60`\n- Every cell of `grid` is either `0` or `1`.\n- Rows all share the same length.\n- Only horizontal and vertical adjacency connects land cells.",
    difficulty: 'hard',
    tags: ['matrix', 'recursion', 'graph'],
    companies: ['Umbrella', 'Globex'],
    functionName: 'countIslands',
    ioSpec: {
      params: [
        {
          name: 'grid',
          type: {
            matrix: 'int',
          },
        },
      ],
      returns: 'int',
    },
    referenceSolution: {
      python:
        'def countIslands(grid):\n    if not grid or not grid[0]:\n        return 0\n    rows = len(grid)\n    cols = len(grid[0])\n    visited = [[False] * cols for _ in range(rows)]\n    count = 0\n    for r in range(rows):\n        for c in range(cols):\n            if grid[r][c] == 1 and not visited[r][c]:\n                count += 1\n                stack = [(r, c)]\n                visited[r][c] = True\n                while stack:\n                    cr, cc = stack.pop()\n                    for dr, dc in ((1, 0), (-1, 0), (0, 1), (0, -1)):\n                        nr, nc = cr + dr, cc + dc\n                        if 0 <= nr < rows and 0 <= nc < cols and grid[nr][nc] == 1 and not visited[nr][nc]:\n                            visited[nr][nc] = True\n                            stack.append((nr, nc))\n    return count\n',
      javascript:
        'function countIslands(grid) {\n    if (!grid || grid.length === 0 || grid[0].length === 0) {\n        return 0;\n    }\n    const rows = grid.length;\n    const cols = grid[0].length;\n    const visited = Array.from({ length: rows }, () => new Array(cols).fill(false));\n    let count = 0;\n    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];\n    for (let r = 0; r < rows; r++) {\n        for (let c = 0; c < cols; c++) {\n            if (grid[r][c] === 1 && !visited[r][c]) {\n                count++;\n                const stack = [[r, c]];\n                visited[r][c] = true;\n                while (stack.length > 0) {\n                    const [cr, cc] = stack.pop();\n                    for (const [dr, dc] of dirs) {\n                        const nr = cr + dr;\n                        const nc = cc + dc;\n                        if (nr >= 0 && nr < rows && nc >= 0 && nc < cols && grid[nr][nc] === 1 && !visited[nr][nc]) {\n                            visited[nr][nc] = true;\n                            stack.push([nr, nc]);\n                        }\n                    }\n                }\n            }\n        }\n    }\n    return count;\n}\n',
    },
    starterCode: {
      python:
        'def countIslands(grid):\n    # TODO: count connected groups of land cells (4-directional).\n    # grid is a list of lists of ints (1 = land, 0 = water).\n    pass\n',
      javascript:
        'function countIslands(grid) {\n    // TODO: count connected groups of land cells (4-directional).\n    // grid is an array of arrays of numbers (1 = land, 0 = water).\n}\n',
    },
    sampleTestcases: [
      {
        inputs: [
          [
            [1, 1, 0, 0],
            [1, 0, 0, 1],
            [0, 0, 1, 1],
            [0, 0, 0, 0],
          ],
        ],
        expected: 2,
        explanation:
          'One island in the top-left; a second formed by the right-side and center-bottom land cells.',
      },
      {
        inputs: [
          [
            [1, 0, 1],
            [0, 1, 0],
            [1, 0, 1],
          ],
        ],
        expected: 5,
        explanation: 'Diagonals do not connect, so all five land cells are separate islands.',
      },
    ],
    hiddenTestcases: [
      {
        inputs: [[]],
        expected: 0,
        explanation: 'A map with no rows has no islands.',
      },
      {
        inputs: [[[0]]],
        expected: 0,
        explanation: 'A single water cell yields zero islands.',
      },
      {
        inputs: [[[1]]],
        expected: 1,
        explanation: 'A single land cell is one island.',
      },
      {
        inputs: [
          [
            [1, 1, 1],
            [1, 1, 1],
          ],
        ],
        expected: 1,
        explanation: 'All land cells are connected into one island.',
      },
      {
        inputs: [
          [
            [0, 0],
            [0, 0],
          ],
        ],
        expected: 0,
        explanation: 'All water, no islands.',
      },
      {
        inputs: [
          [
            [1, 1, 0, 0, 1, 0],
            [0, 1, 0, 1, 1, 0],
            [0, 0, 0, 0, 0, 0],
            [1, 0, 1, 1, 0, 1],
            [1, 0, 0, 1, 0, 1],
          ],
        ],
        expected: 5,
        explanation: 'Five separate land clusters spread across the map.',
      },
      {
        inputs: [
          [
            [1, 1, 1, 1],
            [0, 0, 0, 1],
            [1, 1, 1, 1],
            [1, 0, 0, 0],
          ],
        ],
        expected: 1,
        explanation: 'A single winding land path snakes through the grid as one island.',
      },
      {
        inputs: [[[1, 0, 1, 1, 0, 1, 1, 1, 0, 1]]],
        expected: 4,
        explanation: 'A single row: each run of consecutive land cells is its own island.',
      },
    ],
  },
  {
    slug: 'min-max-split-sum',
    title: 'Minimize Largest Split Sum',
    statementMarkdown:
      "A fulfillment center has a line of packages moving down a conveyor belt. The weights of the packages, in belt order, are given by `nums`. You must dispatch every package to exactly `k` delivery trucks.\n\nBecause the belt cannot reorder items, each truck picks up a **contiguous run** of packages, the runs are taken left to right, and every truck must carry **at least one** package. The load of a truck is the sum of the weights it carries.\n\nReturn the minimum possible value of the **heaviest** truck's load, over all valid ways to cut the belt into exactly `k` contiguous runs.\n\n## Examples\n\n### Example 1\nInput: `nums = [7, 2, 5, 10, 8]`, `k = 2`\nOutput: `18`\nExplanation: The best cut is `[7, 2, 5]` and `[10, 8]`, giving loads `14` and `18`. The heaviest load is `18`. Any other cut into 2 runs (for example `[7, 2]` and `[5, 10, 8]` = `9, 23`) has a heavier maximum.\n\n### Example 2\nInput: `nums = [1, 2, 3, 4, 5]`, `k = 3`\nOutput: `6`\nExplanation: Cutting into `[1, 2, 3]`, `[4]`, `[5]` yields loads `6, 4, 5`. The heaviest load is `6`, and no split into 3 runs does better.\n\n## Constraints\n\n- `1 <= nums.length <= 10^5`\n- `0 <= nums[i] <= 10^9`\n- `1 <= k <= nums.length`\n- The total weight can exceed the 32-bit range, so the answer is returned as a 64-bit integer.",
    difficulty: 'hard',
    tags: ['binary-search', 'greedy', 'arrays'],
    companies: ['Acme', 'Hooli'],
    functionName: 'minLargestSplitSum',
    ioSpec: {
      params: [
        {
          name: 'nums',
          type: {
            array: 'int',
          },
        },
        {
          name: 'k',
          type: 'int',
        },
      ],
      returns: 'long',
    },
    referenceSolution: {
      python:
        'def minLargestSplitSum(nums, k):\n    def groups_needed(cap):\n        groups = 1\n        cur = 0\n        for v in nums:\n            if cur + v <= cap:\n                cur += v\n            else:\n                groups += 1\n                cur = v\n        return groups\n\n    lo = max(nums)\n    hi = sum(nums)\n    while lo < hi:\n        mid = (lo + hi) // 2\n        if groups_needed(mid) <= k:\n            hi = mid\n        else:\n            lo = mid + 1\n    return lo\n',
      javascript:
        'function minLargestSplitSum(nums, k) {\n    function groupsNeeded(cap) {\n        let groups = 1;\n        let cur = 0;\n        for (const v of nums) {\n            if (cur + v <= cap) {\n                cur += v;\n            } else {\n                groups += 1;\n                cur = v;\n            }\n        }\n        return groups;\n    }\n\n    let lo = Math.max(...nums);\n    let hi = nums.reduce((a, b) => a + b, 0);\n    while (lo < hi) {\n        const mid = Math.floor((lo + hi) / 2);\n        if (groupsNeeded(mid) <= k) {\n            hi = mid;\n        } else {\n            lo = mid + 1;\n        }\n    }\n    return lo;\n}\n',
    },
    starterCode: {
      python: 'def minLargestSplitSum(nums, k):\n    # TODO: implement\n    pass\n',
      javascript: 'function minLargestSplitSum(nums, k) {\n    // TODO: implement\n}\n',
    },
    sampleTestcases: [
      {
        inputs: [[7, 2, 5, 10, 8], 2],
        expected: 18,
        explanation: 'Cut into [7,2,5] and [10,8] for loads 14 and 18; the heaviest is 18.',
      },
      {
        inputs: [[1, 2, 3, 4, 5], 3],
        expected: 6,
        explanation: 'Cut into [1,2,3], [4], [5] for loads 6, 4, 5; the heaviest is 6.',
      },
    ],
    hiddenTestcases: [
      {
        inputs: [[5], 1],
        expected: 5,
        explanation: 'Single package, single truck: the only load is 5.',
      },
      {
        inputs: [[4, 1, 7, 3], 4],
        expected: 7,
        explanation:
          'k equals the length, so every truck holds one package; the heaviest single package is 7.',
      },
      {
        inputs: [[3, 3, 3, 3], 2],
        expected: 6,
        explanation: 'Split evenly into [3,3] and [3,3]; both loads are 6.',
      },
      {
        inputs: [[0, 0, 0], 2],
        expected: 0,
        explanation: 'All weights are zero, so every valid split has maximum load 0.',
      },
      {
        inputs: [[2, 3, 1, 2, 4, 3, 5, 1, 6, 2], 4],
        expected: 8,
        explanation:
          'Best cut [2,3,1,2], [4,3], [5,1], [6,2] gives loads 8, 7, 6, 8; the heaviest is 8.',
      },
      {
        inputs: [[1, 2, 3, 4], 1],
        expected: 10,
        explanation: 'One truck must carry everything, so the load is the total 10.',
      },
      {
        inputs: [[1000000000, 1000000000, 1000000000], 1],
        expected: 3000000000,
        explanation: 'One truck carries all three; the load 3000000000 exceeds 32-bit range.',
      },
      {
        inputs: [[5, 1, 1, 1, 1, 5], 3],
        expected: 5,
        explanation:
          'Cut [5], [1,1,1,1], [5] gives loads 5, 4, 5; the answer cannot beat the largest element 5.',
      },
    ],
  },
  {
    slug: 'count-grid-paths',
    title: 'Count Grid Paths With Obstacles',
    statementMarkdown:
      'A delivery drone starts at the top-left cell of a rectangular warehouse floor and must reach the loading dock at the bottom-right cell. On each move the drone may step exactly one cell **right** or one cell **down** — never up, left, or diagonally.\n\nThe floor is given as a matrix `grid`, where `grid[i][j]` is `0` for an open cell and `1` for a shelf the drone cannot fly through. Count the number of **distinct** routes from the top-left cell to the bottom-right cell that never pass over a shelf.\n\nIf the starting cell or the destination cell is itself a shelf (value `1`), no route exists, so return `0`. Because large open floors can have an enormous number of routes, the answer is returned as a 64-bit integer.\n\n## Examples\n\n### Example 1\nInput: `grid = [[0,0,0],[0,1,0],[0,0,0]]`\nOutput: `2`\nExplanation: The center cell is blocked. The only two shelf-free routes are: all the way right then all the way down, and all the way down then all the way right.\n\n### Example 2\nInput: `grid = [[0,0],[0,0]]`\nOutput: `2`\nExplanation: On a fully open 2x2 floor the drone can go right-then-down or down-then-right.\n\n## Constraints\n- `1 <= number of rows of grid <= 40`\n- `1 <= number of columns of grid <= 40`\n- Every `grid[i][j]` is either `0` (open) or `1` (blocked).\n- The returned count fits within a signed 64-bit integer.',
    difficulty: 'hard',
    tags: ['dynamic-programming', 'matrix'],
    companies: ['Hooli', 'Initech'],
    functionName: 'countGridPaths',
    ioSpec: {
      params: [
        {
          name: 'grid',
          type: {
            matrix: 'int',
          },
        },
      ],
      returns: 'long',
    },
    referenceSolution: {
      python:
        'def countGridPaths(grid):\n    if not grid or not grid[0]:\n        return 0\n    m = len(grid)\n    n = len(grid[0])\n    if grid[0][0] == 1 or grid[m - 1][n - 1] == 1:\n        return 0\n    dp = [[0] * n for _ in range(m)]\n    dp[0][0] = 1\n    for i in range(m):\n        for j in range(n):\n            if grid[i][j] == 1:\n                dp[i][j] = 0\n                continue\n            if i == 0 and j == 0:\n                continue\n            top = dp[i - 1][j] if i > 0 else 0\n            left = dp[i][j - 1] if j > 0 else 0\n            dp[i][j] = top + left\n    return dp[m - 1][n - 1]\n',
      javascript:
        'function countGridPaths(grid) {\n  if (!grid || grid.length === 0 || grid[0].length === 0) return 0;\n  const m = grid.length;\n  const n = grid[0].length;\n  if (grid[0][0] === 1 || grid[m - 1][n - 1] === 1) return 0;\n  const dp = Array.from({ length: m }, () => new Array(n).fill(0));\n  dp[0][0] = 1;\n  for (let i = 0; i < m; i++) {\n    for (let j = 0; j < n; j++) {\n      if (grid[i][j] === 1) { dp[i][j] = 0; continue; }\n      if (i === 0 && j === 0) continue;\n      const top = i > 0 ? dp[i - 1][j] : 0;\n      const left = j > 0 ? dp[i][j - 1] : 0;\n      dp[i][j] = top + left;\n    }\n  }\n  return dp[m - 1][n - 1];\n}\n',
    },
    starterCode: {
      python:
        'def countGridPaths(grid):\n    # TODO: count distinct right/down paths from top-left to bottom-right\n    # avoiding cells equal to 1. Return 0 if start or end is blocked.\n    pass\n',
      javascript:
        'function countGridPaths(grid) {\n  // TODO: count distinct right/down paths from top-left to bottom-right\n  // avoiding cells equal to 1. Return 0 if start or end is blocked.\n}\n',
    },
    sampleTestcases: [
      {
        inputs: [
          [
            [0, 0, 0],
            [0, 1, 0],
            [0, 0, 0],
          ],
        ],
        expected: 2,
        explanation:
          'The blocked center forces the drone around the outside; exactly two routes remain.',
      },
      {
        inputs: [
          [
            [0, 0],
            [0, 0],
          ],
        ],
        expected: 2,
        explanation: 'Fully open 2x2 floor: right-down or down-right.',
      },
    ],
    hiddenTestcases: [
      {
        inputs: [[[0]]],
        expected: 1,
        explanation: 'A single open cell is both start and end, giving one trivial route.',
      },
      {
        inputs: [[[1]]],
        expected: 0,
        explanation: 'The only cell is blocked, so no route exists.',
      },
      {
        inputs: [
          [
            [1, 0],
            [0, 0],
          ],
        ],
        expected: 0,
        explanation: 'The starting cell is a shelf.',
      },
      {
        inputs: [
          [
            [0, 0],
            [0, 1],
          ],
        ],
        expected: 0,
        explanation: 'The destination cell is a shelf.',
      },
      {
        inputs: [
          [
            [0, 0, 0],
            [1, 1, 1],
            [0, 0, 0],
          ],
        ],
        expected: 0,
        explanation: 'A full row of shelves separates start from end, blocking every route.',
      },
      {
        inputs: [
          [
            [0, 0, 0, 0],
            [0, 1, 0, 1],
            [0, 0, 0, 0],
          ],
        ],
        expected: 2,
        explanation: 'Two interior shelves leave only two feasible routes to the bottom-right.',
      },
      {
        inputs: [
          [
            [0, 0, 0, 0, 0],
            [0, 0, 0, 0, 0],
            [0, 0, 0, 0, 0],
            [0, 0, 0, 0, 0],
          ],
        ],
        expected: 35,
        explanation: 'Open 4x5 floor: C(7,3) = 35 routes.',
      },
      {
        inputs: [
          [
            [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
            [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
            [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
            [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
            [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
            [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
            [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
            [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
            [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
            [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
          ],
        ],
        expected: 48620,
        explanation: 'Open 10x10 floor: C(18,9) = 48620 routes.',
      },
    ],
  },
  {
    slug: 'can-segment-words',
    title: 'Word Break Feasibility',
    statementMarkdown:
      'You run a sign shop that builds banners by laying down pre-cut sticker strips in a single row, left to right, with no gaps and no overlaps. Each strip in your catalog `dictionary` shows a fixed lowercase string, and you keep an unlimited supply of every strip, so any strip may be reused as many times as you like.\n\nGiven a target banner text `s`, decide whether you can reproduce it **exactly** by concatenating one or more catalog strips. Return `true` if it is possible and `false` otherwise. By convention, an empty banner `s` needs no strips and is always considered buildable.\n\n## Examples\n\n### Example 1\nInput: `s = "codestack"`, `dictionary = ["code", "stack", "co", "de"]`\n\nOutput: `true`\n\nExplanation: Lay down `"code"` then `"stack"` to spell `codestack`.\n\n### Example 2\nInput: `s = "codestackx"`, `dictionary = ["code", "stack"]`\n\nOutput: `false`\n\nExplanation: `"code"` and `"stack"` cover `codestack`, but no strip supplies the trailing `x`, so the banner cannot be completed.\n\n## Constraints\n- `0 <= s.length <= 300`\n- `s` consists of lowercase English letters.\n- `0 <= dictionary.length <= 1000`\n- Each entry of `dictionary` is a non-empty string of lowercase English letters with length at most `20`.\n- `dictionary` may contain duplicate strips; strips may be reused any number of times.',
    difficulty: 'hard',
    tags: ['dynamic-programming', 'strings', 'hashing'],
    companies: ['Globex', 'Hooli'],
    functionName: 'canSegment',
    ioSpec: {
      params: [
        {
          name: 's',
          type: 'string',
        },
        {
          name: 'dictionary',
          type: {
            array: 'string',
          },
        },
      ],
      returns: 'bool',
    },
    referenceSolution: {
      python:
        'def canSegment(s, dictionary):\n    words = set(dictionary)\n    n = len(s)\n    dp = [False] * (n + 1)\n    dp[0] = True\n    for i in range(1, n + 1):\n        for j in range(i):\n            if dp[j] and s[j:i] in words:\n                dp[i] = True\n                break\n    return dp[n]\n',
      javascript:
        'function canSegment(s, dictionary) {\n    const words = new Set(dictionary);\n    const n = s.length;\n    const dp = new Array(n + 1).fill(false);\n    dp[0] = true;\n    for (let i = 1; i <= n; i++) {\n        for (let j = 0; j < i; j++) {\n            if (dp[j] && words.has(s.slice(j, i))) {\n                dp[i] = true;\n                break;\n            }\n        }\n    }\n    return dp[n];\n}\n',
    },
    starterCode: {
      python:
        'def canSegment(s, dictionary):\n    # TODO: return True if s can be split into a sequence of\n    # one or more (reusable) strips from dictionary, else False.\n    pass\n',
      javascript:
        'function canSegment(s, dictionary) {\n    // TODO: return true if s can be split into a sequence of\n    // one or more (reusable) strips from dictionary, else false.\n}\n',
    },
    sampleTestcases: [
      {
        inputs: ['codestack', ['code', 'stack', 'co', 'de']],
        expected: true,
        explanation: '"code" + "stack" spells the whole banner.',
      },
      {
        inputs: ['codestackx', ['code', 'stack']],
        expected: false,
        explanation: "No strip supplies the trailing 'x'.",
      },
    ],
    hiddenTestcases: [
      {
        inputs: ['', []],
        expected: true,
        explanation: 'An empty banner needs no strips and is buildable by convention.',
      },
      {
        inputs: ['abc', []],
        expected: false,
        explanation: 'A non-empty banner cannot be built from an empty catalog.',
      },
      {
        inputs: ['a', ['b']],
        expected: false,
        explanation: 'Single character has no matching strip.',
      },
      {
        inputs: ['aaaa', ['a', 'aa']],
        expected: true,
        explanation: 'Strips are reusable, e.g. "aa" + "aa".',
      },
      {
        inputs: ['aaaab', ['a', 'aa', 'aaa']],
        expected: false,
        explanation: "The leading a's are coverable but the trailing 'b' cannot be produced.",
      },
      {
        inputs: ['abcd', ['abc', 'ab', 'cd']],
        expected: true,
        explanation:
          'Greedy longest-first picks "abc" and gets stuck; the valid split is "ab" + "cd".',
      },
      {
        inputs: ['abab', ['ab', 'ab', 'a', 'b']],
        expected: true,
        explanation: 'Duplicate strips in the catalog are harmless; "ab" + "ab" works.',
      },
      {
        inputs: ['onetwothree', ['one', 'two', 'three', 'four']],
        expected: true,
        explanation: '"one" + "two" + "three" reproduces the banner.',
      },
    ],
  },
  {
    slug: 'min-covering-window-length',
    title: 'Minimum Covering Window Length',
    statementMarkdown:
      'A quality-control scanner reads a long tape of characters `s` and must locate the tightest stretch that carries a full shipment of required parts described by `t`.\n\nGiven two strings `s` and `t`, return the length of the **shortest contiguous substring** (window) of `s` that contains every character of `t`, respecting multiplicities: if a character occurs `k` times in `t`, the chosen window must contain that character **at least** `k` times. Return `0` if no such window exists.\n\nMatching is case-sensitive, and extra characters inside the window are allowed as long as all required characters are present. If `t` is empty, return `0`.\n\n## Examples\n\n### Example 1\n- Input: `s = "figuring"`, `t = "gin"`\n- Output: `3`\n- Explanation: The window `"ing"` (the last three characters) contains one `g`, one `i`, and one `n`. No shorter window covers all three required characters, so the answer is `3`.\n\n### Example 2\n- Input: `s = "aabbcc"`, `t = "abc"`\n- Output: `4`\n- Explanation: To include an `a`, a `b`, and a `c` in one contiguous stretch you must span from an `a` through the first `c`, for example `"abbc"` (length `4`). Nothing shorter works.\n\n## Constraints\n- `0 <= s.length <= 100000`\n- `0 <= t.length <= 100000`\n- `s` and `t` consist of uppercase and lowercase English letters only.\n- Comparison is case-sensitive (`\'a\'` and `\'A\'` are different characters).',
    difficulty: 'hard',
    tags: ['sliding-window', 'hashing', 'strings'],
    companies: ['Hooli', 'Globex'],
    functionName: 'minCoveringWindow',
    ioSpec: {
      params: [
        {
          name: 's',
          type: 'string',
        },
        {
          name: 't',
          type: 'string',
        },
      ],
      returns: 'int',
    },
    referenceSolution: {
      python:
        'from collections import Counter\n\ndef minCoveringWindow(s, t):\n    if not t:\n        return 0\n    need = Counter(t)\n    required = len(need)\n    have = 0\n    window = {}\n    best = 0\n    left = 0\n    for right in range(len(s)):\n        ch = s[right]\n        window[ch] = window.get(ch, 0) + 1\n        if ch in need and window[ch] == need[ch]:\n            have += 1\n        while have == required:\n            cur = right - left + 1\n            if best == 0 or cur < best:\n                best = cur\n            lch = s[left]\n            window[lch] -= 1\n            if lch in need and window[lch] < need[lch]:\n                have -= 1\n            left += 1\n    return best\n',
      javascript:
        'function minCoveringWindow(s, t) {\n  if (t.length === 0) return 0;\n  const need = {};\n  for (const ch of t) need[ch] = (need[ch] || 0) + 1;\n  const required = Object.keys(need).length;\n  let have = 0;\n  const window = {};\n  let best = 0;\n  let left = 0;\n  for (let right = 0; right < s.length; right++) {\n    const ch = s[right];\n    window[ch] = (window[ch] || 0) + 1;\n    if (need[ch] !== undefined && window[ch] === need[ch]) have++;\n    while (have === required) {\n      const cur = right - left + 1;\n      if (best === 0 || cur < best) best = cur;\n      const lch = s[left];\n      window[lch]--;\n      if (need[lch] !== undefined && window[lch] < need[lch]) have--;\n      left++;\n    }\n  }\n  return best;\n}\n',
    },
    starterCode: {
      python:
        'def minCoveringWindow(s, t):\n    # TODO: return the length of the shortest substring of s that\n    # contains every character of t (including multiplicities), or 0.\n    pass\n',
      javascript:
        'function minCoveringWindow(s, t) {\n  // TODO: return the length of the shortest substring of s that\n  // contains every character of t (including multiplicities), or 0.\n}\n',
    },
    sampleTestcases: [
      {
        inputs: ['figuring', 'gin'],
        expected: 3,
        explanation: 'The window "ing" holds g, i, and n; no shorter window covers all three.',
      },
      {
        inputs: ['aabbcc', 'abc'],
        expected: 4,
        explanation: 'The shortest stretch containing a, b, and c is "abbc" of length 4.',
      },
    ],
    hiddenTestcases: [
      {
        inputs: ['aaab', 'aa'],
        expected: 2,
        explanation:
          'Two a\'s are required; the window "aa" of length 2 satisfies the multiplicity.',
      },
      {
        inputs: ['abc', 'd'],
        expected: 0,
        explanation: 's contains no d, so no valid window exists.',
      },
      {
        inputs: ['ab', 'abc'],
        expected: 0,
        explanation: 's lacks a c, so it can never cover all of t.',
      },
      {
        inputs: ['hello', ''],
        expected: 0,
        explanation: 'An empty t requires nothing, so the answer is 0 by definition.',
      },
      {
        inputs: ['z', 'z'],
        expected: 1,
        explanation: 'A single matching character forms a window of length 1.',
      },
      {
        inputs: ['mississippi', 'issp'],
        expected: 4,
        explanation:
          'Need i, s, s, p; the window "ssip" of length 4 covers two s\'s, one i, and one p.',
      },
      {
        inputs: ['banana', 'ann'],
        expected: 3,
        explanation: 'Need two n\'s and one a; the window "nan" of length 3 works.',
      },
      {
        inputs: ['aaaaaa', 'aaa'],
        expected: 3,
        explanation:
          "Three a's are required and any three consecutive a's suffice, giving length 3.",
      },
    ],
  },
];
