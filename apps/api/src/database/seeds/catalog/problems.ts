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
      'Given an array of integers `nums`, return the sum of all its elements. The sum of an empty array is `0`.',
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
      'Given a string `s`, return the string with its characters in reverse order.',
    difficulty: 'easy',
    tags: ['strings'],
    companies: ['Acme'],
    functionName: 'reverseString',
    ioSpec: { params: [{ name: 's', type: 'string' }], returns: 'string' },
    referenceSolution: {
      python: 'def reverseString(s):\n    return s[::-1]\n',
      javascript:
        "function reverseString(s) {\n  return s.split('').reverse().join('');\n}\n",
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
      'Given a string `s`, return the number of vowels (`a`, `e`, `i`, `o`, `u`, case-insensitive) it contains.',
    difficulty: 'easy',
    tags: ['strings'],
    companies: ['Globex'],
    functionName: 'countVowels',
    ioSpec: { params: [{ name: 's', type: 'string' }], returns: 'int' },
    referenceSolution: {
      python:
        "def countVowels(s):\n    return sum(1 for c in s.lower() if c in 'aeiou')\n",
      javascript:
        'function countVowels(s) {\n  return (s.match(/[aeiou]/gi) || []).length;\n}\n',
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
      'Given a non-empty array of integers `nums`, return the largest element.',
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
      'Given a string `s`, return `true` if it reads the same forwards and backwards, otherwise `false`.',
    difficulty: 'easy',
    tags: ['strings', 'two-pointers'],
    companies: ['Acme', 'Initech'],
    functionName: 'isPalindrome',
    ioSpec: { params: [{ name: 's', type: 'string' }], returns: 'bool' },
    referenceSolution: {
      python: 'def isPalindrome(s):\n    return s == s[::-1]\n',
      javascript:
        "function isPalindrome(s) {\n  return s === s.split('').reverse().join('');\n}\n",
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
      'Given a non-negative integer `n` (0 ≤ n ≤ 20), return `n!` (the product of all integers from 1 to n). `0!` is `1`.',
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
      'Given an integer `n`, return how many integers from `1` to `n` (inclusive) are divisible by 3 or by 5.',
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
    sampleTestcases: [
      { inputs: [15], expected: 7, explanation: '3,5,6,9,10,12,15' },
    ],
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
      'Given two non-negative integers `a` and `b` (not both zero), return their greatest common divisor.',
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
      'Given an array of integers `nums`, return the second largest **distinct** value. If there is only one distinct value, return that value.',
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
      'Given an array of integers `nums`, return the sum of the even numbers. Return `0` if there are none.',
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
      'Given a string `s`, return the number of words in it. Words are maximal runs of non-whitespace characters.',
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
];
