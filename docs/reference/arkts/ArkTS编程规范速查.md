# ArkTS 编程规范速查（AI 优化版）

> 本文档为 AI 高效使用版，省略示例代码。完整示例见原文档。

## 级别说明

- **要求**：必须遵从
- **建议**：最佳实践

---

## 命名规范

| 类型 | 风格 | 示例 |
|------|------|------|
| 类/枚举/命名空间 | UpperCamelCase | `UserManager`, `ColorType` |
| 变量/方法/参数 | lowerCamelCase | `userName`, `getUserById()` |
| 常量/枚举值 | UPPER_SNAKE_CASE | `MAX_COUNT`, `USER_TYPE_ADMIN` |
| 布尔变量 | is/has/can/should 前缀 | `isValid`, `hasNext`, `canEdit` |

**命名原则**：
- 清晰表达意图，禁用单字母/非标准缩写
- 使用正确英文，禁用拼音
- 类名用名词，函数名用动词
- **禁止否定布尔名**：用 `isError` 而非 `isNoError`

---

## 格式规范

| 规则 | 级别 | 要点 |
|------|------|------|
| 缩进 | 建议 | 2 空格，禁用 Tab |
| 行宽 | 建议 | ≤120 字符 |
| 大括号 | 建议 | if/for/while/do 必须加 `{}` |
| 大括号位置 | 建议 | 与语句同行：`function foo() {` |
| else/catch | 建议 | 与 `}` 同行：`} else {`、`} catch {` |
| switch 缩进 | 建议 | case/default 缩进 2 空格 |
| 换行 | 建议 | 运算符放行末 |
| 变量声明 | **要求** | 每行只声明一个变量 |
| 字符串 | 建议 | 使用单引号 `'str'` |
| 对象字面量 | 建议 | 属性 >4 个时换行 |

**空格规则**：
- `if (`、`for (`、`while (` 关键字后加空格
- 函数名与 `(` 之间不加空格
- `} else`、`} catch` 之间加空格
- 二元/三元运算符两侧加空格
- 逗号后加空格，逗号前不加
- `[]` 内侧不加空格

---

## 编程实践

### 要求级别（必须遵从）

| 规则 | 说明 |
|------|------|
| NaN 判断 | 必须用 `Number.isNaN()`，禁用 `== NaN` |
| 数组遍历 | 优先用 `map/filter/forEach/reduce/find/some/every` |
| 条件表达式禁赋值 | `if (x = 1)` 禁止，应 `if (x === 1)` |
| finally 正常结束 | 禁止在 finally 中 return/break/continue/throw |

### 建议级别

| 规则 | 说明 |
|------|------|
| 类属性修饰符 | 显式添加 `private`/`protected`/`public` |
| 浮点数 | 不省略小数点前后的 0：`0.5` 而非 `.5` |
| 避免 ESObject | 非跨语言场景禁用，有性能开销 |
| 数组类型 | 用 `T[]` 而非 `Array<T>` |

---

## 快速检查清单

```
□ 类/枚举/命名空间：UpperCamelCase
□ 变量/方法/参数：lowerCamelCase
□ 常量/枚举值：UPPER_SNAKE_CASE
□ 布尔变量有 is/has/can 前缀且非否定
□ 缩进用空格，每行 ≤120 字符
□ if/for/while 有大括号
□ 每行只声明一个变量
□ NaN 用 Number.isNaN() 判断
□ 数组遍历用 Array 方法
□ 条件表达式无赋值
□ finally 无 return/break/continue
□ 类属性有访问修饰符
□ 数组类型用 T[]
```
