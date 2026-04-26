---
title: "再看 JavaScript"
description: "之前一直学 JavaScript 一直没有深入，这次重新梳理，尝试理解，突然发现原型链、事件循环、闭包、Promise 这些东西其实是互相配合的一套完整机制，以前觉得零散的概念，现在终于串起来了。"
pubDate: "2026 04 26"
tags: ["JavaScript"]
---

JavaScript 诞生于 1995 年，由 Brendan Eich 仅用 10 天设计完成，最初叫做 LiveScript，后来在与 Sun Microsystems 合作期间改名为 JavaScript——名字里蹭了 Java 的热度，实际上两者关系并不大。如今，它是全球使用最广泛的编程语言之一，撑起了大半个互联网：浏览器端的交互、Node.js 驱动的后端服务、甚至嵌入式脚本，都能看到它的身影。弱类型、动态、解释执行——这些特性让它极度灵活。

# 1. 类型

## 1.1 基本数据类型

和大多数语言一样，基本数据类型无非是数字、字符串、布尔值这些。不同的是，JS 没有指针的概念，统一用"引用"来访问对象，在一定程度上降低了语言的复杂度。

截至目前（2026/04/24），JS 共有 **7 种基本数据类型**：数字相关的 `number` 和 `bigint`，两个空值 `null` 和 `undefined`，布尔值 `boolean`，以及 `string` 和 `symbol`。[MDN 文档](https://developer.mozilla.org/zh-CN/docs/Glossary/Primitive) 明确指出，JS 的基本数据类型都是**不可变的（immutable）**。

我对“不可变”理解是：由于没有指针，无法直接修改分配在栈上内存里的原始值，只能重新赋值给变量。

```js
let a = 10;
// 并没有直接修改原来的值，而是让变量 a 指向一个新值
a = 100;

let str = "hello, world";
// 在严格模式下，以下操作会直接报错
str[1] = "b";
// TypeError: Cannot assign to read only property '1' of string 'hello, world'
```

JS 有**两个空值**：关键字 `null` 和标识符 `undefined`。从语义上讲，`undefined` 有“声明了但尚未赋值”的含义，因此普遍的共识是：`null` 表示**有意的空**，`undefined` 则更多是**无意的空**。其中 `typeof null === "object"` 是早期实现留下的历史遗留问题，原因与早期的类型标签设计有关。这个 bug 之所以一直保留，是为了兼容既有网页。`undefined` 本质上是全局对象（浏览器中为 `window`，Node.js 中为 `global`，标准化后统一可用 `globalThis` 访问）的一个只读属性。早年间甚至可以对它重新赋值，后来才改为只读：

```js
// TypeError: Cannot assign to read only property 'undefined' of object '#<Window>'
globalThis.undefined = "aaa";
```

还有一个比较特殊的基本类型：`symbol`，很长一段时间内，JavaScript 对象的属性名只能是字符串，库一多就容易出现命名冲突——两个不同的库都在对象上挂了一个叫 `type` 的属性，互相覆盖。`Symbol()` 每次调用都会返回一个**唯一的 symbol**，天然解决了这个问题：

```js
const sym1 = Symbol("description");
const sym2 = Symbol("description");
console.log(sym1 === sym2); // false，即使描述相同，也是不同的值
```

`symbol` 还有另一个用途：JS 引擎内置了一批 **Well-known Symbols**（如 `Symbol.iterator`、`Symbol.toPrimitive`、`Symbol.hasInstance` 等），作为“协议接口”定义对象的行为能力。这个机制和 Java 的 `interface` 有几分相似——通过实现特定的 symbol 方法，赋予对象某种能力：

```js
// 给自定义对象实现 Symbol.iterator，相当于实现了 Java 的 Iterable 接口
const range = {
  start: 1,
  end: 5,
  [Symbol.iterator]() {
    let current = this.start;
    const last = this.end;
    return {
      next() {
        if (current <= last) {
          return { value: current++, done: false };
        }
        return { done: true };
      },
    };
  },
};

for (const num of range) {
  console.log(num); // 1, 2, 3, 4, 5
}
```

不过相较于 Java 的 `interface`，这是一种**运行时协议**：引擎只会在运行时检查对象是否有对应的 symbol 方法，没有编译期类型检查，也不能保证方法签名正确。

## 1.2 引用类型

JS 中除基本类型以外，其余都是引用类型，统一属于 `Object`，如 `Date`、`RegExp`、`Map`、`Set` 等，以及部分基本类型的包装类 `Number`、`String`、`Symbol`。在 Java 中，类是对象的模板，在类中定义方法，实例化的每个对象都共享这些方法，类与类之间可以继承以复用代码，且所有类都是 `Object` 的子类。JS 在 ES6 加入了 `class` 关键字，虽说是语法糖，但写起来和 Java 几乎一样：

```js
class Animal {
  constructor(name) {
    this.name = name;
  }

  sayHi() {
    console.log(`Hi, I am ${this.name}!`);
  }
}

class Cat extends Animal {
  constructor(name) {
    super(name);
  }

  catchFish() {
    console.log("I am catching fish!");
  }
}
```

构造器、方法定义、`this`、`super` 以及 `extends`，简直和 Java 如出一辙。但语法糖终究是语法糖，查看 `Animal` 的类型，会发现它本质是一个函数：

```js
console.log(typeof Animal === "function"); // true
```

ES6 之前，JS 通过**原型链**来实现代码复用。上面的类定义，等价于：

```js
// Animal 构造函数
function Animal(name) {
  this.name = name;
}

// 在 prototype 上定义方法，new 出来的所有实例共享这份方法
Animal.prototype.sayHi = function () {
  console.log(`Hi, I am ${this.name}!`);
};

// Cat 构造函数
function Cat(name) {
  Animal.call(this, name); // 等价于 super(name)
}

// 建立原型链：让 Cat.prototype 继承自 Animal.prototype
Cat.prototype = Object.create(Animal.prototype);
// 修复 constructor 指向（Object.create 后 constructor 指向了 Animal）
Cat.prototype.constructor = Cat;

// Cat 特有的原型方法
Cat.prototype.catchFish = function () {
  console.log("I am catching fish!");
};
```

用 `class` 定义类时，蓝图和实例的关系一目了然；而用原型链时，这层关系就模糊许多——`Animal` 本身是一个 `Function` 对象，同时充当构造函数，其 `prototype` 属性才是后续 `new` 出来的对象真正的“蓝图”。

理解原型链，需要区分两个容易混淆的属性：

- `prototype`：这是函数对象上的属性，指向一个对象，作为“蓝图”供 `new` 出来的实例继承。只有函数有。
- `[[Prototype]]`（即 `__proto__`）：这是每个对象内部都有的一个插槽，指向该对象的原型。实例通过它向上查找属性。

当你访问 `sillyCat.sayHi` 时，JS 引擎做的事情是：先在 `sillyCat` 自身的属性上找，没有；再沿 `[[Prototype]]` 向上到 `Cat.prototype` 上找，没有；再向上到 `Animal.prototype` 上找，找到了，执行之。如果一路找到 `Object.prototype` 还没有，就继续找 `null`——`Object.prototype` 的 `[[Prototype]]` 就是 `null`，链到此终止，返回 `undefined`。

```js
const sillyCat = new Cat("Silly");

console.log(Animal.__proto__ === Function.prototype); // true，Animal 是 Function 的实例
console.log(sillyCat.__proto__ === Cat.prototype); // true
console.log(sillyCat.__proto__.__proto__ === Animal.prototype); // true
console.log(sillyCat.__proto__.__proto__.__proto__ === Object.prototype); // true
console.log(Object.prototype.__proto__ === null); // true，链到此终止

sillyCat.sayHi(); // Hi, I am Silly!
```

根据 ECMAScript 规范，`someObject.[[Prototype]]` 是访问对象原型的标准内部插槽，推荐通过 [`Object.getPrototypeOf()`](https://developer.mozilla.org/zh-CN/docs/Web/JavaScript/Reference/Global_Objects/Object/getPrototypeOf) 和 [`Object.setPrototypeOf()`](https://developer.mozilla.org/zh-CN/docs/Web/JavaScript/Reference/Global_Objects/Object/setPrototypeOf) 访问和修改。`__proto__` 是等效的非标准访问器，虽然主流引擎都实现了它，但在生产代码中应优先使用标准 API。

上面特意强调了 `function` 和 `new` 关键字，这其实和 `this` 的动态绑定密切相关。在 Java 中，`this` 明确指向当前实例；在 JS 中，`this` 的值取决于**函数的调用方式**，而不是函数的定义位置。函数作为某个对象的方法调用，`this` 指向调用点前面那个对象，此时和Java无异；但如果作为单独的函数调用，`this`将会绑定到全局对象上，而在严格模式下则是 `undefined`。

```js
const sillyCat = new Cat("Silly");
sillyCat.sayHi(); // 隐式绑定：this = sillyCat，正常

const funcSayHi = sillyCat.sayHi;
funcSayHi(); // 默认绑定：严格模式下 this = undefined，报错
// TypeError: Cannot read properties of undefined (reading 'name')
```

我们可以手动的改变 `this` 的指向，JS 提供了三种方法：`call`、`apply` 和 `bind`。前两者会立即执行函数，区别在于传参方式；`bind` 则返回一个新的函数，绑定了指定的 `this`，但不立即执行：

```js
funcSayHi.call(sillyCat); // 立即执行，逐个传参
funcSayHi.apply(sillyCat, []); // 立即执行，数组传参
const bound = funcSayHi.bind(sillyCat); // 返回绑定后的新函数，不立即执行
bound();
```

综合来看，`new` 关键字大致做了以下几件事：1. 创建一个新的空对象；2. 将其 `[[Prototype]]` 指向构造函数的 `prototype`；3. 将 `this` 绑定到该对象并执行构造函数。

```js
function myNew(constructor, ...args) {
  // 步骤 1 + 2：创建空对象，原型指向构造函数的 prototype
  const obj = Object.create(constructor.prototype);

  // 步骤 3：绑定 this 并执行构造函数
  const result = constructor.apply(obj, args);

  // 如果构造函数显式返回了一个对象或函数，以其为准；否则返回新对象
  return (typeof result === "object" && result !== null) || typeof result === "function" ? result : obj;
}
```

由于**箭头函数没有自己的 `this`**，它不参与上述任何绑定规则，而是在定义时**捕获外层词法作用域的 `this`**，且无法被 `call`/`apply`/`bind` 改变，也不能用 `new` 调用：

```js
function Timer() {
  this.seconds = 0;
  setInterval(() => {
    // 箭头函数捕获了 Timer 构造调用时的 this（即实例本身）
    // 如果这里用普通函数，this 会变成 globalThis 或 undefined
    this.seconds++;
    console.log(this.seconds);
  }, 1000);
}
```

> 箭头函数没有 `prototype`，但有 `__proto__`——它自身作为对象，原型指向 `Function.prototype`。

说到可见性控制，Java 有非常丰富的修饰符（`private`、`public`、`final` 等）。在 JS 中，对象是**属性的集合**，属性分为两种：**数据属性**（键值对）和**访问器属性**（getter/setter）。两者都有特性描述符，可以通过 `Object.defineProperty` 精确控制行为：

```js
let obj = { name: "Alice" };

// 精确控制数据属性
// 描述符：[[Value]] [[Writable]] [[Enumerable]] [[Configurable]]
Object.defineProperty(obj, "id", {
  value: 1001,
  writable: false, // 不可修改
  enumerable: true, // 可枚举（for...in 可见）
  configurable: false, // 不可删除、不可再重新配置
});

// 精确控制访问器属性
Object.defineProperty(obj, "age", {
  // _age 是真正的存储字段，约定以下划线开头表示"不应直接访问"
  get() {
    return this._age;
  },
  set(val) {
    if (val < 0) throw new Error("年龄不能为负");
    this._age = val;
  },
  enumerable: true,
  configurable: true,
});
```

> **枚举 vs 迭代**：`enumerable` 控制**属性键**能否被枚举（`for...in...`），而前文提到的 `Symbol.iterator` 定义的是**元素值**能否被迭代（`for...of...`）

自 ES6 引入 `class` 语法糖后，后续版本也持续补充了更多原生能力：ES2020 带来了以 `#` 为前缀的私有字段和私有方法；ES2022 允许在类顶层直接声明字段，引入 `#field in obj` 的品牌检查（brand check）以及静态初始化块。

```js
class BankAccount {
  // ES2022: 顶层公有字段
  owner = "Unknown";
  // ES2022: 顶层私有字段声明
  #accountNumber;
  // ES2020: 私有字段
  #balance;
  // ES2020: 静态私有字段
  static #bankName;

  // ES2022: 静态初始化块（比静态字段赋值更灵活，可写条件逻辑）
  static {
    BankAccount.#bankName = "Global Bank";
  }

  constructor(owner, accountNumber, initialBalance) {
    this.owner = owner;
    this.#accountNumber = accountNumber;
    this.#balance = initialBalance;
  }

  // ES2020: 私有方法
  #logTransaction(type, amount) {
    console.log(`${type}: ${amount}，账号：${this.#accountNumber}`);
  }

  deposit(amount) {
    this.#balance += amount;
    this.#logTransaction("存款", amount);
  }

  withdraw(amount) {
    if (amount <= this.#balance) {
      this.#balance -= amount;
      this.#logTransaction("取款", amount);
    }
  }

  get balance() {
    return this.#balance;
  }

  static getBankName() {
    return BankAccount.#bankName;
  }

  // ES2022: 品牌检查——比 instanceof 更可靠，可抵御跨 realm 的误判
  static isBankAccount(obj) {
    return #balance in obj;
  }
}
```

---

# 2. 作用域与函数

## 2.1 作用域

JS 主要有 4 种作用域：**全局作用域、函数作用域、块级作用域（ES6+）和模块作用域（ES6+）**，和大多数编程语言大同小异。

全局作用域意味着所有代码都能访问，比如 `globalThis` 对象本身。在本站的源码里，HTML 头部塞入了一小段 JS，在第一帧绘制前就设置好主题颜色，避免闪烁。几个辅助函数暴露在全局作用域中，这样其他地方可以直接调用——比如现在打开控制台输入 `toggleTheme()` 就能触发主题切换：

```js
const applyTheme = () => {
  document.documentElement.classList.toggle(
    "dark",
    localStorage.theme === "dark" ||
      (!("theme" in localStorage) && window.matchMedia("(prefers-color-scheme: dark)").matches),
  );
};

const toggleTheme = () => {
  const isDark = document.documentElement.classList.toggle("dark");
  localStorage.theme = isDark ? "dark" : "light";
};

const getTheme = () => {
  const isDark =
    document.documentElement.classList.contains("dark") ||
    window.matchMedia("(prefers-color-scheme: dark)").matches;
  return isDark ? "dark" : "light";
};
```

这是一种特殊用法，一般不建议污染全局作用域。如果只是需要立即执行一些初始化代码，推荐使用 **IIFE（Immediately Invoked Function Expression）**，通过函数作用域将内部变量隔离起来：

```js
(() => {
  var a = 10;
  console.log("Hi.");
})();
// a 无法从外部访问
```

模块作用域是 ES6 加入的。如果在 `<script>` 标签上加 `type="module"`，其中定义的变量和函数就不再影响全局作用域了。在绝大多数项目开发中，随处可见的 `export` 和 `import` 本质上都在利用模块作用域——一个文件即一个独立作用域，Node.js 等运行时也遵循同样的规则。

函数作用域和块级作用域是 JS 里最值得深聊的部分。JS 诞生之初，为了打破“函数必须先声明才能调用”的顺序限制，JS 设计了**提升（Hoisting）机制**。引擎在正式执行代码之前，有一个**解析阶段**，会提前扫描当前作用域内所有的函数声明和变量声明，在内存中为它们预留位置：

```js
// 先调用
sayHello();

// 后声明——解析阶段已将其提升
function sayHello() {
  console.log("Hello, Hoisting!");
}
```

对于 `var` 声明的变量，提升的只是**声明**，不包括赋值。变量在提升后会被初始化为 `undefined`：

```js
console.log(a); // undefined（声明已提升，但赋值尚未执行到）
var a = 10;
console.log(a); // 10
```

这也解释了为什么 `undefined` 比 `null` 更多地代表“无意的空”——变量被提升并初始化后、赋值前，JS 就给了它一个 `undefined`。函数表达式的变量也只提升声明，不提升赋值：

```js
greet(); // TypeError: greet is not a function（greet 此时是 undefined）

var greet = function () {
  console.log("Hi");
};

// 引擎实际执行的等价逻辑：
var greet; // 提升声明，初始化为 undefined
greet(); // 调用 undefined，报错
greet = function () {
  console.log("Hi");
};
```

ES6 加入的 `let` 和 `const`\***\* 也会在解析阶段被登记（"提升"），但它们**不会**被初始化为 \*\***`undefined`，而是被放入**暂时性死区（TDZ，Temporal Dead Zone）**——在声明语句被实际执行之前，该变量处于“已存在但不可访问”的状态，任何读写都会抛出 `ReferenceError`：

```js
console.log(y); // ReferenceError: Cannot access 'y' before initialization
let y = 20;
// 当执行到这一行时，y 才脱离 TDZ，被初始化为 20
```

TDZ 的本质是一种安全设计：它保证了 `let`/`const` 声明的变量在初始化之前不可见，从根本上杜绝了 `var` 那种“先用后声明”的隐患。

跟着 `let`/`const` 一起加入的，还有块级作用域。核心规则简单：内层作用域可以访问外层作用域的变量，反之不行。而 `var` 对块级作用域视而不见，直接逃逸到外层的函数或全局作用域，可以总结为：`var` 的提升最低是**函数作用域级别**；`let`/`const` 的提升是**块级作用域级别**，且在初始化前受 TDZ 保护。

```js
{
  let block = "inside block";
  const PI = 3.14;
  var escape = "I am var"; // var 穿透块，逃到外层
}

console.log(block); // ReferenceError
console.log(PI); // ReferenceError
console.log(escape); // "I am var"

// 经典的 var 循环陷阱
for (var i = 0; i < 3; i++) {
  setTimeout(() => console.log(i), 0);
}
// 输出：3, 3, 3
// 原因：var i 属于外层函数/全局作用域，三个箭头函数共享同一个 i
// 当 setTimeout 的回调执行时，循环早已结束，i 已经是 3

// let 正确行为
for (let j = 0; j < 3; j++) {
  setTimeout(() => console.log(j), 0);
}
// 输出：0, 1, 2
// 原因：每次迭代 let j 创建一个独立的块级绑定，每个回调捕获的是不同的 j
```

## 2.2 函数

JS 中的函数是**一等公民**，可以赋值给变量、作为参数传入、也可以从函数中返回。ES6 加入箭头函数后，函数式编程的风格愈发明显。

```js
function square(a) {
  return a * a;
}

// 箭头函数：更简洁，且没有自己的 this、arguments、prototype
const squareArrow = (a) => a * a;
```

在普通函数中，可以通过类数组对象 `arguments` 获取传入的所有参数；箭头函数没有 `arguments`，改用**剩余参数（rest parameters）**，拿到的是真数组，语义更清晰：

```js
function sum() {
  // arguments 是类数组对象，有索引和 length，但没有 map、filter 等数组方法
  console.log(arguments); // Arguments [1, 2, 3, ...]
  let total = 0;
  for (let val of arguments) total += val;
  return total;
}

const arrowSum = (...args) => {
  // args 是真正的数组，可以直接使用所有数组方法
  console.log(args); // [1, 2, 3]
  return args.reduce((a, b) => a + b, 0);
};
```

JS 函数的一等公民地位，使得 Lambda、闭包、柯里化等函数式编程技巧都十分自然：

```js
const numbers = [1, 2, 3, 4, 5];

const doubled = numbers.map((n) => n * 2); // 匿名函数（Lambda）
const doubleIt = (n) => n * 2;
const doubled2 = numbers.map(doubleIt); // 函数作为参数（高阶函数）
```

**闭包（Closure）** 是函数在定义时**捕获其词法作用域**中自由变量的能力。具体来说，当一个函数被创建时，它会持有一个指向其外层词法环境（Lexical Environment）的引用；即使外层函数已经执行完毕、从调用栈上弹出，只要内层函数还存活，这片词法环境就不会被垃圾回收，依然保存在堆内存中。

这正是防抖和节流能够工作的原因——每次调用 `debounce` 或 `throttle` 都会在堆上创建一个新的 `timer` 变量，返回的函数持有对它的引用，后续每次调用都在操作同一个 `timer`：

```js
// 防抖：连续触发时只执行最后一次，常用于搜索输入
function debounce(fn, delay) {
  let timer = null; // 这个 timer 活在堆上，被返回的函数持有
  return function (...args) {
    if (timer) clearTimeout(timer); // 每次触发都取消上一个计时器
    timer = setTimeout(() => {
      fn.apply(this, args);
      timer = null;
    }, delay);
  };
}

// 节流：固定时间间隔内最多执行一次，常用于滚动事件
function throttle(fn, delay) {
  let timer = null;
  return function (...args) {
    if (timer) return; // 计时器存在说明还在冷却中，直接跳过
    timer = setTimeout(() => {
      fn.apply(this, args);
      timer = null;
    }, delay);
  };
}
```

高阶函数是指接收函数作为参数或返回函数的函数。`debounce`、`throttle` 本身就是高阶函数；`Array.prototype.map`、`filter`、`reduce` 也都是。柯里化是将一个多参数函数转化为一系列单参数函数的技术。其核心价值在于**参数复用**：固定部分参数，得到一个更具体的函数：

```js
const add = (a, b) => a + b;

// 柯里化：一次只接受一个参数
const curriedAdd = (a) => (b) => a + b;

const add5 = curriedAdd(5); // 固定 a = 5，返回一个新函数
console.log(add5(3)); // 8
console.log(add5(10)); // 15
```

柯里化、纯函数（Pure Function）、函子（Functor）等更深层的概念属于函数式编程的范畴，感兴趣的话推荐去了解下 Haskell——换一门语言来理解这些概念，往往比在 JS 里绕圈子清晰得多。

---

# 3. 并发系统

## 3.1 事件循环

JavaScript 的并发模型本质上是**单线程 + 事件驱动 + 异步机制**。无论是浏览器还是 Node.js，JS 主线程永远是单线程的，但整体运行环境并不只有单线程：浏览器是“多模块并发”（渲染线程、网络线程、JS 线程等各司其职），Node.js 是“统一调度 + libuv 线程池并发”。下面以浏览器为主；Node.js 的事件循环还有 libuv 的阶段划分和 process.nextTick 等细节。

JS 代码在一个后进先出（LIFO）的**调用栈（Call Stack）**中执行，函数调用压栈，执行完毕出栈。同一时刻只能处理一件事。但当主线程遇到 `setTimeout`、`fetch` 等异步调用时，可以将其**委托**给浏览器提供的 Web API，由对应的后台线程（计时器线程、网络线程等）处理，主线程继续向下执行，不需要等待。

当后台的异步操作完成后，其注册的**回调函数**不会立刻执行，而是被放入一个**任务队列**等待。**事件循环**就是驱动整个系统的调度器：它持续监测调用栈，一旦调用栈为空，就从任务队列中取出一个任务推入栈中执行，如此循环往复。

JS 将任务分为**宏任务**和**微任务**两类：

| 类型   | 来源示例                                                                                                  |
| ------ | --------------------------------------------------------------------------------------------------------- |
| 宏任务 | `setTimeout`、`setInterval`、I/O 回调、`<script>` 初始执行、`MessageChannel`                              |
| 微任务 | `Promise.then/catch/finally`、`queueMicrotask`、`MutationObserver`、`queueReactiveSideEffect`（Vue 内部） |

分成两类的原因在于**优先级**：如果把点击回调、网络响应、Promise 回调全塞进一个队列，某类高频任务就可能拖延其他任务，影响输入响应和页面渲染的流畅性。

事件循环的完整执行节奏如下：

1. 从宏任务队列取出**一个**宏任务执行；
2. 该宏任务执行完毕后，**清空整个微任务队列**——包括在清空过程中新产生的微任务（微任务可以递归产生新的微任务，全部清完才停）；
3. 浏览器进行**渲染更新**（如果有需要）；
4. 回到步骤 1，取下一个宏任务。

```js
console.log("1 - 同步");

setTimeout(() => console.log("2 - 宏任务"), 0);

Promise.resolve()
  .then(() => {
    console.log("3 - 微任务 A");
    // 在微任务执行过程中再产生一个微任务
    return Promise.resolve();
  })
  .then(() => console.log("4 - 微任务 B"));

console.log("5 - 同步");

// 输出顺序：
// 1 - 同步
// 5 - 同步
// 3 - 微任务 A   ← 当前宏任务（script）结束，开始清空微任务队列
// 4 - 微任务 B   ← 微任务 A 产生的新微任务，也在这一轮被清空
// 2 - 宏任务     ← 微任务队列清空后，才轮到下一个宏任务
```

## 3.2 Promise

在 Promise 出现之前，JS 处理异步的主要方式是**回调函数（Callback）**。回调本身没有问题，但当多个异步操作存在依赖关系时，就会出现层层嵌套的**回调地狱（Callback Hell）**，代码的逻辑流向不再是线性的，可读性和可维护性都极差：

```js
// 回调地狱：嵌套层数随依赖深度线性增长
fetchUser(userId, (user) => {
  fetchOrders(user.id, (orders) => {
    fetchOrderDetail(orders[0].id, (detail) => {
      render(detail, (result) => {
        console.log(result);
        // 每多一层依赖，就多一层缩进
      });
    });
  });
});
```

ES6 引入的 **Promise** 是对异步操作的一层封装，代表一个**尚未完成但最终会有结果的操作**。Promise 有三种状态：

1. `pending`：初始状态，操作尚未完成；
2. `fulfilled`：操作成功完成，持有一个结果值；
3. `rejected`：操作失败，持有一个错误原因。

状态一旦从 `pending` 转变为 `fulfilled` 或 `rejected`，就**不可再改变**。

```js
const promise = new Promise((resolve, reject) => {
  // executor 函数在 new Promise 时同步执行
  setTimeout(() => {
    const success = true;
    if (success) {
      resolve("操作成功"); // 将 Promise 推向 fulfilled
    } else {
      reject(new Error("操作失败")); // 将 Promise 推向 rejected
    }
  }, 1000);
});

promise
  .then((result) => console.log(result)) // "操作成功"
  .catch((err) => console.error(err));
```

Promise 最关键的设计是**链式调用**。`.then` 每次调用都返回一个**全新的 Promise**，其状态取决于处理函数的返回值：

- 返回一个普通值 → 新 Promise 以该值 `fulfilled`；
- 返回一个 Promise → 新 Promise 跟随该 Promise 的状态；
- 抛出异常 → 新 Promise 以该异常 `rejected`。

这个机制使得多个异步操作可以被串成一条线性的链，彻底摆脱嵌套：

```js
fetchUser(userId)
  .then((user) => fetchOrders(user.id)) // 返回 Promise，链继续
  .then((orders) => fetchOrderDetail(orders[0].id))
  .then((detail) => {
    render(detail);
    return detail; // 返回普通值，下一个 .then 收到它
  })
  .then((detail) => console.log("完成：", detail))
  .catch((err) => {
    // 链中任意一步 reject 或抛出异常，都会跳到这里
    console.error("出错了：", err);
  });
```

Promise 还提供了几个处理并发场景的静态方法：

```js
// 全部成功才 resolve，任一失败则立即 reject（适合"必须都成功"的场景）
Promise.all([fetch("/api/a"), fetch("/api/b")]).then(([resA, resB]) => {
  /* 两个都成功 */
});

// 任一率先 settle（无论成功还是失败）就返回（适合取最快响应）
Promise.race([fetchFromServerA(), fetchFromServerB()]).then((result) => console.log("最快的结果：", result));

// 等全部 settle 后返回所有结果（无论成败），适合"需要知道每个结果"的场景
Promise.allSettled([fetch("/api/a"), fetch("/api/b")]).then((results) => {
  results.forEach((r) => {
    if (r.status === "fulfilled") console.log("成功：", r.value);
    else console.log("失败：", r.reason);
  });
});
```

ES2017 带来了 **`async/await`**，本质是 Promise 链的语法糖，让异步代码读起来像同步代码，大幅降低了理解成本：

```js
async function loadDetail(userId) {
  try {
    const user = await fetchUser(userId);
    const orders = await fetchOrders(user.id);
    const detail = await fetchOrderDetail(orders[0].id);
    return detail; // 返回值自动包装为 Promise.resolve(detail)
  } catch (err) {
    // 任意一个 await 的 Promise rejected，都会跳到这里
    console.error("出错了：", err);
  }
}
```

`async` 函数有以下几个要点：

- 函数的返回值无论是什么，都会被自动包装成 Promise；
- `await` 只能在 `async` 函数内使用（ES2022 后，模块顶层可以直接使用 Top-level await）；
- `await` 暂停的是当前 `async` 函数的执行，**不会阻塞主线程**——暂停后，`await` 后面的代码被注册为微任务，主线程立即去执行其他任务。

```js
async function example() {
  console.log("A");
  await Promise.resolve(); // 暂停，将后续代码注册为微任务，让出主线程
  console.log("C"); // 作为微任务，在当前宏任务结束后执行
}

example();
console.log("B"); // example 让出后，主线程继续执行这里

// 输出：A → B → C
```

结合事件循环来理解 Promise 和 `async/await`，整个 JS 异步模型就清晰了：Promise 的回调（`.then`）进入微任务队列，在当前宏任务结束后**立刻**被处理，优先于下一个宏任务（如 `setTimeout` 的回调）。`async/await` 只是把这套机制包上了一层更易读的外衣。

---

# 参考资料

- [You Dont Know JS 2nd](https://github.com/getify/you-dont-know-js)
- [Mostly adequate guide to FP (in javascript)](https://mostly-adequate.gitbook.io/mostly-adequate-guide)
- [Lean Your Haskell](https://learnyouahaskell.github.io/)
- [MDN JS Reference](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference)
- [Why is typeof null is object in JS](https://stackoverflow.com/questions/18808226/why-is-typeof-null-object)
