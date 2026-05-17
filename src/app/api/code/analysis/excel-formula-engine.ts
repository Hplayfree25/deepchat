export const excelFormulaEngineSource = String.raw`
import ast
import math
import operator
import re

OPS = {
    ast.Add: operator.add,
    ast.Sub: operator.sub,
    ast.Mult: operator.mul,
    ast.Div: operator.truediv,
    ast.Pow: operator.pow,
    ast.USub: operator.neg,
    ast.UAdd: operator.pos,
}

COMPARES = {
    "=": operator.eq,
    "==": operator.eq,
    "<>": operator.ne,
    "!=": operator.ne,
    ">": operator.gt,
    "<": operator.lt,
    ">=": operator.ge,
    "<=": operator.le,
}

def cell_value(cell):
    value = cell.value
    if value is None:
        return ""
    if hasattr(value, "isoformat"):
        return value.isoformat()
    return value

def cached_value(values_workbook, sheet_name, coordinate):
    try:
        value = values_workbook[sheet_name][coordinate].value
        if value is None:
            return ""
        if hasattr(value, "isoformat"):
            return value.isoformat()
        return value
    except Exception:
        return ""

def split_args(text):
    args = []
    current = ""
    depth = 0
    quote = ""
    for char in str(text):
        if quote:
            current += char
            if char == quote:
                quote = ""
            continue
        if char in ["'", '"']:
            quote = char
            current += char
            continue
        if char == "(":
            depth += 1
        elif char == ")":
            depth -= 1
        if char == "," and depth == 0:
            args.append(current.strip())
            current = ""
        else:
            current += char
    if current.strip():
        args.append(current.strip())
    return args

def normalize_ref(value):
    return str(value or "").replace("$", "").strip()

def parse_ref(ref, current_sheet):
    text = normalize_ref(ref)
    if "!" not in text:
        return current_sheet, text
    sheet_name, coordinate = text.rsplit("!", 1)
    return sheet_name.strip("'"), coordinate

def as_number(value):
    if value in ["", None]:
        return 0
    if isinstance(value, bool):
        return 1 if value else 0
    if isinstance(value, (int, float)):
        if isinstance(value, float) and (math.isnan(value) or math.isinf(value)):
            return 0
        return value
    text = str(value).strip().replace(",", "")
    if text.endswith("%"):
        text = text[:-1]
        try:
            return float(text) / 100
        except Exception:
            return 0
    try:
        return float(text)
    except Exception:
        return 0

def flatten(values):
    result = []
    for value in values:
        if isinstance(value, list):
            result.extend(flatten(value))
        else:
            result.append(value)
    return result

def range_values(workbook, values_workbook, ref, current_sheet, seen):
    sheet_name, coordinate = parse_ref(ref, current_sheet)
    if ":" not in coordinate:
        return [evaluate_cell(workbook, values_workbook, sheet_name, coordinate, seen)]
    start, end = coordinate.split(":", 1)
    try:
        cells = workbook[sheet_name][start + ":" + end]
    except Exception:
        return []
    values = []
    for row in cells:
        for cell in row:
            values.append(evaluate_cell(workbook, values_workbook, sheet_name, cell.coordinate, seen))
    return values

def safe_eval_number(expression):
    node = ast.parse(str(expression), mode="eval").body
    def walk(item):
        if isinstance(item, ast.Constant) and isinstance(item.value, (int, float)):
            return item.value
        if isinstance(item, ast.BinOp) and type(item.op) in OPS:
            return OPS[type(item.op)](walk(item.left), walk(item.right))
        if isinstance(item, ast.UnaryOp) and type(item.op) in OPS:
            return OPS[type(item.op)](walk(item.operand))
        raise ValueError("unsupported expression")
    return walk(node)

def compare_values(left, right, op):
    fn = COMPARES.get(op)
    if not fn:
        return False
    try:
        return fn(as_number(left), as_number(right))
    except Exception:
        return fn(str(left), str(right))

def evaluate_condition(workbook, values_workbook, expression, current_sheet, current_coordinate, seen):
    text = str(expression or "").strip()
    for op in [">=", "<=", "<>", "!=", "=", ">", "<"]:
        if op in text:
            left, right = text.split(op, 1)
            return compare_values(evaluate_expression(workbook, values_workbook, left, current_sheet, current_coordinate, seen), evaluate_expression(workbook, values_workbook, right, current_sheet, current_coordinate, seen), op)
    return bool(evaluate_expression(workbook, values_workbook, text, current_sheet, current_coordinate, seen))

def function_value(name, args, workbook, values_workbook, current_sheet, current_coordinate, seen):
    upper = name.upper()
    parts = split_args(args)
    if upper in ["SUM", "AVERAGE", "MAX", "MIN", "COUNT", "COUNTA", "MEDIAN", "PRODUCT"]:
        values = []
        for part in parts:
            if ":" in part:
                values.extend(range_values(workbook, values_workbook, part, current_sheet, seen))
            else:
                values.append(evaluate_expression(workbook, values_workbook, part, current_sheet, current_coordinate, seen))
        flat = flatten(values)
        numbers = [as_number(value) for value in flat if value not in ["", None]]
        if upper == "SUM":
            return sum(numbers)
        if upper == "AVERAGE":
            return sum(numbers) / len(numbers) if numbers else 0
        if upper == "MAX":
            return max(numbers) if numbers else 0
        if upper == "MIN":
            return min(numbers) if numbers else 0
        if upper == "COUNT":
            return len(numbers)
        if upper == "COUNTA":
            return len([value for value in flat if value not in ["", None]])
        if upper == "MEDIAN":
            ordered = sorted(numbers)
            if not ordered:
                return 0
            middle = len(ordered) // 2
            return ordered[middle] if len(ordered) % 2 else (ordered[middle - 1] + ordered[middle]) / 2
        total = 1
        for number in numbers:
            total *= number
        return total
    if upper in ["ROUND", "ROUNDUP", "ROUNDDOWN"]:
        value = as_number(evaluate_expression(workbook, values_workbook, parts[0], current_sheet, current_coordinate, seen)) if parts else 0
        digits = int(as_number(evaluate_expression(workbook, values_workbook, parts[1], current_sheet, current_coordinate, seen))) if len(parts) > 1 else 0
        if upper == "ROUNDUP":
            factor = 10 ** digits
            return math.ceil(value * factor) / factor
        if upper == "ROUNDDOWN":
            factor = 10 ** digits
            return math.floor(value * factor) / factor
        return round(value, digits)
    if upper in ["ABS", "SQRT", "POWER"]:
        value = as_number(evaluate_expression(workbook, values_workbook, parts[0], current_sheet, current_coordinate, seen)) if parts else 0
        if upper == "ABS":
            return abs(value)
        if upper == "SQRT":
            return math.sqrt(value)
        power = as_number(evaluate_expression(workbook, values_workbook, parts[1], current_sheet, current_coordinate, seen)) if len(parts) > 1 else 1
        return value ** power
    if upper == "ROW":
        return int("".join(char for char in current_coordinate if char.isdigit()) or "1")
    if upper == "COLUMN":
        letters = "".join(char for char in current_coordinate if char.isalpha()).upper()
        value = 0
        for char in letters:
            value = value * 26 + ord(char) - 64
        return value
    if upper == "IF":
        if len(parts) < 3:
            return ""
        return evaluate_expression(workbook, values_workbook, parts[1 if evaluate_condition(workbook, values_workbook, parts[0], current_sheet, current_coordinate, seen) else 2], current_sheet, current_coordinate, seen)
    if upper in ["CONCAT", "CONCATENATE"]:
        return "".join(str(evaluate_expression(workbook, values_workbook, part, current_sheet, current_coordinate, seen)) for part in parts)
    return None

def replace_functions(workbook, values_workbook, expression, current_sheet, current_coordinate, seen):
    pattern = re.compile(r"\b(SUM|AVERAGE|MAX|MIN|COUNT|COUNTA|MEDIAN|PRODUCT|ROUND|ROUNDUP|ROUNDDOWN|ABS|SQRT|POWER|ROW|COLUMN|IF|CONCAT|CONCATENATE)\(", re.I)
    while True:
        match = pattern.search(expression)
        if not match:
            return expression
        start = match.end()
        depth = 1
        index = start
        while index < len(expression) and depth:
            if expression[index] == "(":
                depth += 1
            elif expression[index] == ")":
                depth -= 1
            index += 1
        if depth:
            return expression
        value = function_value(match.group(1), expression[start:index - 1], workbook, values_workbook, current_sheet, current_coordinate, seen)
        if value is None:
            return expression
        replacement = str(as_number(value)) if isinstance(value, (int, float)) else '"' + str(value).replace('"', '') + '"'
        expression = expression[:match.start()] + replacement + expression[index:]

def evaluate_index_match(workbook, values_workbook, expression, current_sheet, seen):
    match = re.fullmatch(r"INDEX\((.+),MATCH\((MAX|MIN)\((.+)\),(.+),0\)\)", expression, re.I)
    if not match:
        return None
    index_range = range_values(workbook, values_workbook, match.group(1), current_sheet, seen)
    target_values = range_values(workbook, values_workbook, match.group(3), current_sheet, seen)
    lookup_values = range_values(workbook, values_workbook, match.group(4), current_sheet, seen)
    numbers = [as_number(value) for value in target_values]
    if not numbers:
        return ""
    target = max(numbers) if match.group(2).upper() == "MAX" else min(numbers)
    position = next((index for index, value in enumerate(lookup_values) if as_number(value) == target), 0)
    return index_range[position] if position < len(index_range) else ""

def evaluate_expression(workbook, values_workbook, expression, current_sheet, current_coordinate, seen):
    text = str(expression or "").strip()
    if text.startswith("="):
        text = text[1:]
    indexed = evaluate_index_match(workbook, values_workbook, text, current_sheet, seen)
    if indexed is not None:
        return indexed
    text = replace_functions(workbook, values_workbook, text, current_sheet, current_coordinate, seen)
    ref_pattern = re.compile(r"(?<![A-Za-z0-9_])(?:(?:'([^']+)'|([A-Za-z0-9_ &]+))!)?(\$?[A-Z]{1,3}\$?\d+)(?![A-Za-z0-9_])")
    def repl(match):
        sheet_name = match.group(1) or match.group(2) or current_sheet
        coordinate = normalize_ref(match.group(3))
        return str(as_number(evaluate_cell(workbook, values_workbook, sheet_name, coordinate, seen)))
    numeric = ref_pattern.sub(repl, text).replace("^", "**")
    if re.fullmatch(r"[0-9.\-+*/() ]+", numeric):
        try:
            return safe_eval_number(numeric)
        except Exception:
            return ""
    if numeric.startswith('"') and numeric.endswith('"'):
        return numeric.strip('"')
    return numeric

def evaluate_cell(workbook, values_workbook, sheet_name, coordinate, seen=None):
    seen = set(seen or set())
    key = sheet_name + "!" + normalize_ref(coordinate)
    if key in seen:
        return ""
    seen.add(key)
    try:
        cell = workbook[sheet_name][normalize_ref(coordinate)]
    except Exception:
        return ""
    raw = cell_value(cell)
    if isinstance(raw, str) and raw.startswith("="):
        cached = cached_value(values_workbook, sheet_name, coordinate)
        value = evaluate_expression(workbook, values_workbook, raw, sheet_name, cell.coordinate, seen)
        return value if value not in ["", None] else cached
    return raw
`;
