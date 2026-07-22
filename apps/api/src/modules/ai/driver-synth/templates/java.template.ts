import { IoSpec } from '../../llm/schemas/generated-problem.schema';
import { javaExtractor, javaSerializeExpr, javaType } from '../type-mapping';

/**
 * Minimal embedded JSON reader/writer covering exactly the bounded io type
 * set (int/long/double/string/bool, one level of array/matrix nesting).
 * Piston sends a single file per submission, so this can't live in its own
 * .java file — it's a second, non-public top-level class in the same file
 * as `Main` (valid Java: only one top-level class per file may be public).
 *
 * Numeric doubles are printed via StringBuilder/`Double`'s default
 * formatting, which switches to scientific notation (invalid JSON) outside
 * roughly [1e-3, 1e7) — an accepted limitation given the bounded, small-value
 * inputs these generated problems target.
 */
const JSON_HELPER_CLASS = `class __Json {
    static String __s;
    static int __pos;

    static Object parse(String s) {
        __s = s;
        __pos = 0;
        return parseValue();
    }

    static void skipWs() {
        while (__pos < __s.length() && Character.isWhitespace(__s.charAt(__pos))) __pos++;
    }

    static Object parseValue() {
        skipWs();
        char c = __s.charAt(__pos);
        if (c == '[') return parseArray();
        if (c == '"') return parseString();
        if (c == 't' || c == 'f') return parseBool();
        return parseNumber();
    }

    static List<Object> parseArray() {
        List<Object> list = new ArrayList<>();
        __pos++;
        skipWs();
        if (__s.charAt(__pos) == ']') {
            __pos++;
            return list;
        }
        while (true) {
            list.add(parseValue());
            skipWs();
            char c = __s.charAt(__pos);
            if (c == ',') {
                __pos++;
                continue;
            }
            if (c == ']') {
                __pos++;
                break;
            }
            break;
        }
        return list;
    }

    static String parseString() {
        StringBuilder sb = new StringBuilder();
        __pos++;
        while (__s.charAt(__pos) != '"') {
            char c = __s.charAt(__pos);
            if (c == '\\\\') {
                __pos++;
                char e = __s.charAt(__pos);
                if (e == 'n') sb.append('\\n');
                else if (e == 't') sb.append('\\t');
                else if (e == 'r') sb.append('\\r');
                else sb.append(e);
                __pos++;
            } else {
                sb.append(c);
                __pos++;
            }
        }
        __pos++;
        return sb.toString();
    }

    static Boolean parseBool() {
        if (__s.startsWith("true", __pos)) {
            __pos += 4;
            return Boolean.TRUE;
        }
        __pos += 5;
        return Boolean.FALSE;
    }

    static Object parseNumber() {
        int start = __pos;
        boolean isDouble = false;
        if (__s.charAt(__pos) == '-') __pos++;
        while (__pos < __s.length()) {
            char c = __s.charAt(__pos);
            if (Character.isDigit(c)) {
                __pos++;
                continue;
            }
            if (c == '.' || c == 'e' || c == 'E' || c == '+' || c == '-') {
                isDouble = true;
                __pos++;
                continue;
            }
            break;
        }
        String numStr = __s.substring(start, __pos);
        return isDouble ? (Object) Double.parseDouble(numStr) : (Object) Long.parseLong(numStr);
    }

    static int toInt(Object o) {
        return (int) toLong(o);
    }

    static long toLong(Object o) {
        return (o instanceof Double) ? ((Double) o).longValue() : (Long) o;
    }

    static double toDouble(Object o) {
        return (o instanceof Long) ? ((Long) o).doubleValue() : (Double) o;
    }

    static String toStr(Object o) {
        return (String) o;
    }

    static boolean toBool(Object o) {
        return (Boolean) o;
    }

    @SuppressWarnings("unchecked")
    static int[] toIntArr(Object o) {
        List<Object> l = (List<Object>) o;
        int[] r = new int[l.size()];
        for (int i = 0; i < l.size(); i++) r[i] = toInt(l.get(i));
        return r;
    }

    @SuppressWarnings("unchecked")
    static long[] toLongArr(Object o) {
        List<Object> l = (List<Object>) o;
        long[] r = new long[l.size()];
        for (int i = 0; i < l.size(); i++) r[i] = toLong(l.get(i));
        return r;
    }

    @SuppressWarnings("unchecked")
    static double[] toDoubleArr(Object o) {
        List<Object> l = (List<Object>) o;
        double[] r = new double[l.size()];
        for (int i = 0; i < l.size(); i++) r[i] = toDouble(l.get(i));
        return r;
    }

    @SuppressWarnings("unchecked")
    static String[] toStrArr(Object o) {
        List<Object> l = (List<Object>) o;
        String[] r = new String[l.size()];
        for (int i = 0; i < l.size(); i++) r[i] = toStr(l.get(i));
        return r;
    }

    @SuppressWarnings("unchecked")
    static boolean[] toBoolArr(Object o) {
        List<Object> l = (List<Object>) o;
        boolean[] r = new boolean[l.size()];
        for (int i = 0; i < l.size(); i++) r[i] = toBool(l.get(i));
        return r;
    }

    @SuppressWarnings("unchecked")
    static int[][] toIntMat(Object o) {
        List<Object> l = (List<Object>) o;
        int[][] r = new int[l.size()][];
        for (int i = 0; i < l.size(); i++) r[i] = toIntArr(l.get(i));
        return r;
    }

    @SuppressWarnings("unchecked")
    static long[][] toLongMat(Object o) {
        List<Object> l = (List<Object>) o;
        long[][] r = new long[l.size()][];
        for (int i = 0; i < l.size(); i++) r[i] = toLongArr(l.get(i));
        return r;
    }

    @SuppressWarnings("unchecked")
    static double[][] toDoubleMat(Object o) {
        List<Object> l = (List<Object>) o;
        double[][] r = new double[l.size()][];
        for (int i = 0; i < l.size(); i++) r[i] = toDoubleArr(l.get(i));
        return r;
    }

    @SuppressWarnings("unchecked")
    static String[][] toStrMat(Object o) {
        List<Object> l = (List<Object>) o;
        String[][] r = new String[l.size()][];
        for (int i = 0; i < l.size(); i++) r[i] = toStrArr(l.get(i));
        return r;
    }

    @SuppressWarnings("unchecked")
    static boolean[][] toBoolMat(Object o) {
        List<Object> l = (List<Object>) o;
        boolean[][] r = new boolean[l.size()][];
        for (int i = 0; i < l.size(); i++) r[i] = toBoolArr(l.get(i));
        return r;
    }

    static String quote(String s) {
        StringBuilder sb = new StringBuilder("\\"");
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            if (c == '"' || c == '\\\\') {
                sb.append('\\\\');
                sb.append(c);
            } else if (c == '\\n') {
                sb.append("\\\\n");
            } else if (c == '\\r') {
                sb.append("\\\\r");
            } else if (c == '\\t') {
                sb.append("\\\\t");
            } else {
                sb.append(c);
            }
        }
        sb.append('"');
        return sb.toString();
    }

    static String arr(int[] a) {
        StringBuilder sb = new StringBuilder("[");
        for (int i = 0; i < a.length; i++) {
            if (i > 0) sb.append(',');
            sb.append(a[i]);
        }
        return sb.append(']').toString();
    }

    static String arr(long[] a) {
        StringBuilder sb = new StringBuilder("[");
        for (int i = 0; i < a.length; i++) {
            if (i > 0) sb.append(',');
            sb.append(a[i]);
        }
        return sb.append(']').toString();
    }

    static String arr(double[] a) {
        StringBuilder sb = new StringBuilder("[");
        for (int i = 0; i < a.length; i++) {
            if (i > 0) sb.append(',');
            sb.append(a[i]);
        }
        return sb.append(']').toString();
    }

    static String arr(boolean[] a) {
        StringBuilder sb = new StringBuilder("[");
        for (int i = 0; i < a.length; i++) {
            if (i > 0) sb.append(',');
            sb.append(a[i]);
        }
        return sb.append(']').toString();
    }

    static String arr(String[] a) {
        StringBuilder sb = new StringBuilder("[");
        for (int i = 0; i < a.length; i++) {
            if (i > 0) sb.append(',');
            sb.append(quote(a[i]));
        }
        return sb.append(']').toString();
    }

    static String arr(int[][] a) {
        StringBuilder sb = new StringBuilder("[");
        for (int i = 0; i < a.length; i++) {
            if (i > 0) sb.append(',');
            sb.append(arr(a[i]));
        }
        return sb.append(']').toString();
    }

    static String arr(long[][] a) {
        StringBuilder sb = new StringBuilder("[");
        for (int i = 0; i < a.length; i++) {
            if (i > 0) sb.append(',');
            sb.append(arr(a[i]));
        }
        return sb.append(']').toString();
    }

    static String arr(double[][] a) {
        StringBuilder sb = new StringBuilder("[");
        for (int i = 0; i < a.length; i++) {
            if (i > 0) sb.append(',');
            sb.append(arr(a[i]));
        }
        return sb.append(']').toString();
    }

    static String arr(boolean[][] a) {
        StringBuilder sb = new StringBuilder("[");
        for (int i = 0; i < a.length; i++) {
            if (i > 0) sb.append(',');
            sb.append(arr(a[i]));
        }
        return sb.append(']').toString();
    }

    static String arr(String[][] a) {
        StringBuilder sb = new StringBuilder("[");
        for (int i = 0; i < a.length; i++) {
            if (i > 0) sb.append(',');
            sb.append(arr(a[i]));
        }
        return sb.append(']').toString();
    }
}`;

/** Expects `{{user_code}}` to define `class Solution { static <ReturnType> functionName(<params>) { ... } }`. */
export function javaDriver(functionName: string, ioSpec: IoSpec): string {
  const reads = ioSpec.params
    .map((p, i) => {
      const raw = `__raw${i}`;
      return [
        `        Object ${raw} = __Json.parse(__br.readLine());`,
        `        ${javaType(p.type)} __arg${i} = ${javaExtractor(p.type)}(${raw});`,
      ].join('\n');
    })
    .join('\n');

  const argNames = ioSpec.params.map((_, i) => `__arg${i}`).join(', ');
  const returnType = javaType(ioSpec.returns);
  const serializeExpr = javaSerializeExpr(ioSpec.returns, '__result');

  return [
    'import java.util.*;',
    'import java.io.*;',
    '',
    // `Main` must be the FIRST top-level class in the file: Piston's Java
    // runtime invokes the file via `java Main.java` (JEP 330 single-file
    // source launch), and per that JEP, the class that gets *executed* is
    // the first class declared in the source — not necessarily the one
    // named after the file or marked `public` — so `{{user_code}}` (the
    // `Solution` class) must come after this or Piston fails with
    // "can't find main(String[]) method in class: Solution".
    'public class Main {',
    '    public static void main(String[] args) throws Exception {',
    '        BufferedReader __br = new BufferedReader(new InputStreamReader(System.in));',
    reads,
    `        ${returnType} __result = Solution.${functionName}(${argNames});`,
    `        System.out.println(${serializeExpr});`,
    '    }',
    '}',
    '',
    '{{user_code}}',
    '',
    JSON_HELPER_CLASS,
    '',
  ].join('\n');
}
