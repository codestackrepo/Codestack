import { IoSpec } from '../../llm/schemas/generated-problem.schema';
import { cppExtractor, cppSerializeExpr, cppType } from '../type-mapping';

/**
 * Minimal embedded JSON reader/writer covering exactly the bounded io type
 * set. `{{user_code}}` is expected to define a plain top-level function
 * named `functionName` (no wrapper class/namespace needed in C++).
 */
const JSON_HELPER_PRELUDE = `struct __JVal {
    enum Kind { NUM_INT, NUM_DOUBLE, STR, BOOL, ARR } kind;
    long long i = 0;
    double d = 0;
    std::string s;
    bool b = false;
    std::vector<__JVal> arr;
};

struct __JParser {
    const std::string& s;
    size_t pos = 0;
    __JParser(const std::string& str) : s(str) {}

    void skipWs() {
        while (pos < s.size() && isspace((unsigned char)s[pos])) pos++;
    }

    __JVal parseValue() {
        skipWs();
        char c = s[pos];
        if (c == '[') return parseArray();
        if (c == '"') return parseString();
        if (c == 't' || c == 'f') return parseBool();
        return parseNumber();
    }

    __JVal parseArray() {
        __JVal v;
        v.kind = __JVal::ARR;
        pos++;
        skipWs();
        if (s[pos] == ']') {
            pos++;
            return v;
        }
        while (true) {
            v.arr.push_back(parseValue());
            skipWs();
            if (s[pos] == ',') {
                pos++;
                continue;
            }
            if (s[pos] == ']') {
                pos++;
                break;
            }
            break;
        }
        return v;
    }

    __JVal parseString() {
        __JVal v;
        v.kind = __JVal::STR;
        pos++;
        std::string out;
        while (pos < s.size() && s[pos] != '"') {
            if (s[pos] == '\\\\' && pos + 1 < s.size()) {
                pos++;
                char c = s[pos];
                if (c == 'n') out += '\\n';
                else if (c == 't') out += '\\t';
                else if (c == 'r') out += '\\r';
                else out += c;
                pos++;
            } else {
                out += s[pos];
                pos++;
            }
        }
        pos++;
        v.s = out;
        return v;
    }

    __JVal parseBool() {
        __JVal v;
        v.kind = __JVal::BOOL;
        if (s.compare(pos, 4, "true") == 0) {
            v.b = true;
            pos += 4;
        } else {
            v.b = false;
            pos += 5;
        }
        return v;
    }

    __JVal parseNumber() {
        size_t start = pos;
        bool isDouble = false;
        if (s[pos] == '-') pos++;
        while (pos < s.size()) {
            char c = s[pos];
            if (isdigit((unsigned char)c)) {
                pos++;
                continue;
            }
            if (c == '.' || c == 'e' || c == 'E' || c == '+' || c == '-') {
                isDouble = true;
                pos++;
                continue;
            }
            break;
        }
        std::string numStr = s.substr(start, pos - start);
        __JVal v;
        if (isDouble) {
            v.kind = __JVal::NUM_DOUBLE;
            v.d = std::stod(numStr);
        } else {
            v.kind = __JVal::NUM_INT;
            v.i = std::stoll(numStr);
        }
        return v;
    }
};

__JVal __parseJson(const std::string& s) {
    __JParser p(s);
    return p.parseValue();
}

int asInt(const __JVal& v) { return (int)(v.kind == __JVal::NUM_DOUBLE ? (long long)v.d : v.i); }
long long asLong(const __JVal& v) { return v.kind == __JVal::NUM_DOUBLE ? (long long)v.d : v.i; }
double asDouble(const __JVal& v) { return v.kind == __JVal::NUM_DOUBLE ? v.d : (double)v.i; }
std::string asStr(const __JVal& v) { return v.s; }
bool asBool(const __JVal& v) { return v.b; }

std::vector<int> asIntArr(const __JVal& v) {
    std::vector<int> r;
    for (auto& e : v.arr) r.push_back(asInt(e));
    return r;
}
std::vector<long long> asLongArr(const __JVal& v) {
    std::vector<long long> r;
    for (auto& e : v.arr) r.push_back(asLong(e));
    return r;
}
std::vector<double> asDoubleArr(const __JVal& v) {
    std::vector<double> r;
    for (auto& e : v.arr) r.push_back(asDouble(e));
    return r;
}
std::vector<std::string> asStrArr(const __JVal& v) {
    std::vector<std::string> r;
    for (auto& e : v.arr) r.push_back(asStr(e));
    return r;
}
std::vector<bool> asBoolArr(const __JVal& v) {
    std::vector<bool> r;
    for (auto& e : v.arr) r.push_back(asBool(e));
    return r;
}

std::vector<std::vector<int>> asIntMat(const __JVal& v) {
    std::vector<std::vector<int>> r;
    for (auto& e : v.arr) r.push_back(asIntArr(e));
    return r;
}
std::vector<std::vector<long long>> asLongMat(const __JVal& v) {
    std::vector<std::vector<long long>> r;
    for (auto& e : v.arr) r.push_back(asLongArr(e));
    return r;
}
std::vector<std::vector<double>> asDoubleMat(const __JVal& v) {
    std::vector<std::vector<double>> r;
    for (auto& e : v.arr) r.push_back(asDoubleArr(e));
    return r;
}
std::vector<std::vector<std::string>> asStrMat(const __JVal& v) {
    std::vector<std::vector<std::string>> r;
    for (auto& e : v.arr) r.push_back(asStrArr(e));
    return r;
}
std::vector<std::vector<bool>> asBoolMat(const __JVal& v) {
    std::vector<std::vector<bool>> r;
    for (auto& e : v.arr) r.push_back(asBoolArr(e));
    return r;
}

std::string __jsonQuote(const std::string& s) {
    std::string out = "\\"";
    for (char c : s) {
        if (c == '"' || c == '\\\\') {
            out += '\\\\';
            out += c;
        } else if (c == '\\n') {
            out += "\\\\n";
        } else if (c == '\\r') {
            out += "\\\\r";
        } else if (c == '\\t') {
            out += "\\\\t";
        } else {
            out += c;
        }
    }
    out += "\\"";
    return out;
}

std::string toJson(int v) { return std::to_string(v); }
std::string toJson(long long v) { return std::to_string(v); }
std::string toJson(double v) {
    std::ostringstream oss;
    oss << v;
    return oss.str();
}
std::string toJson(bool v) { return v ? "true" : "false"; }
std::string toJson(const std::string& v) { return __jsonQuote(v); }

std::string toJson(const std::vector<int>& v) {
    std::string out = "[";
    for (size_t i = 0; i < v.size(); i++) {
        if (i) out += ',';
        out += toJson(v[i]);
    }
    return out + "]";
}
std::string toJson(const std::vector<long long>& v) {
    std::string out = "[";
    for (size_t i = 0; i < v.size(); i++) {
        if (i) out += ',';
        out += toJson(v[i]);
    }
    return out + "]";
}
std::string toJson(const std::vector<double>& v) {
    std::string out = "[";
    for (size_t i = 0; i < v.size(); i++) {
        if (i) out += ',';
        out += toJson(v[i]);
    }
    return out + "]";
}
std::string toJson(const std::vector<bool>& v) {
    std::string out = "[";
    for (size_t i = 0; i < v.size(); i++) {
        if (i) out += ',';
        out += toJson((bool)v[i]);
    }
    return out + "]";
}
std::string toJson(const std::vector<std::string>& v) {
    std::string out = "[";
    for (size_t i = 0; i < v.size(); i++) {
        if (i) out += ',';
        out += toJson(v[i]);
    }
    return out + "]";
}
std::string toJson(const std::vector<std::vector<int>>& v) {
    std::string out = "[";
    for (size_t i = 0; i < v.size(); i++) {
        if (i) out += ',';
        out += toJson(v[i]);
    }
    return out + "]";
}
std::string toJson(const std::vector<std::vector<long long>>& v) {
    std::string out = "[";
    for (size_t i = 0; i < v.size(); i++) {
        if (i) out += ',';
        out += toJson(v[i]);
    }
    return out + "]";
}
std::string toJson(const std::vector<std::vector<double>>& v) {
    std::string out = "[";
    for (size_t i = 0; i < v.size(); i++) {
        if (i) out += ',';
        out += toJson(v[i]);
    }
    return out + "]";
}
std::string toJson(const std::vector<std::vector<bool>>& v) {
    std::string out = "[";
    for (size_t i = 0; i < v.size(); i++) {
        if (i) out += ',';
        out += toJson(v[i]);
    }
    return out + "]";
}
std::string toJson(const std::vector<std::vector<std::string>>& v) {
    std::string out = "[";
    for (size_t i = 0; i < v.size(); i++) {
        if (i) out += ',';
        out += toJson(v[i]);
    }
    return out + "]";
}
`;

export function cppDriver(functionName: string, ioSpec: IoSpec): string {
  const reads = ioSpec.params
    .map((p, i) => {
      return [
        `    std::string __line${i};`,
        `    std::getline(std::cin, __line${i});`,
        `    ${cppType(p.type)} __arg${i} = ${cppExtractor(p.type)}(__parseJson(__line${i}));`,
      ].join('\n');
    })
    .join('\n');

  const argNames = ioSpec.params.map((_, i) => `__arg${i}`).join(', ');
  const returnType = cppType(ioSpec.returns);
  const serializeExpr = cppSerializeExpr('__result');

  return [
    '#include <bits/stdc++.h>',
    'using namespace std;',
    '',
    JSON_HELPER_PRELUDE,
    '{{user_code}}',
    '',
    'int main() {',
    reads,
    `    ${returnType} __result = ${functionName}(${argNames});`,
    `    std::cout << ${serializeExpr} << std::endl;`,
    '    return 0;',
    '}',
    '',
  ].join('\n');
}
