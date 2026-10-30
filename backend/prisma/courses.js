// Starter courses. Lessons are Markdown; `problems` are practice problem slugs.
export const COURSES = [
  {
    slug: "python",
    title: "Python Programming",
    icon: "🐍",
    level: "Beginner",
    description: "Learn Python from zero: variables, control flow, functions and the data structures you'll use every day.",
    modules: [
      {
        title: "Getting started",
        lessons: [
          {
            title: "Your first program",
            videoUrl: "https://www.youtube.com/watch?v=kqtD5dpn9C8",
            content: `Python runs your code line by line, top to bottom. The classic first program prints text:

\`\`\`python
print("Hello, Quantum Code!")
\`\`\`

## Reading input
On this platform your program reads **standard input** and writes **standard output**.

\`\`\`python
name = input()          # reads one line
print("Hi", name)
\`\`\`

To read two numbers on one line:

\`\`\`python
a, b = map(int, input().split())
print(a + b)
\`\`\`

Try it on the practice problem below.`,
            problems: ["sum-of-two-numbers"],
          },
          {
            title: "Variables and types",
            content: `A variable is a name for a value. Python works out the type for you.

\`\`\`python
age = 21            # int
price = 9.99        # float
name = "Asha"       # str
is_admin = False    # bool
\`\`\`

## Converting between types
\`\`\`python
int("42")      # 42
str(42)        # "42"
float("3.5")   # 3.5
\`\`\`

## Strings
\`\`\`python
s = "quantum"
print(len(s))      # 7
print(s.upper())   # QUANTUM
print(s[::-1])     # mutnauq  (reversed!)
\`\`\``,
            problems: ["reverse-a-string"],
          },
        ],
      },
      {
        title: "Control flow",
        lessons: [
          {
            title: "If, elif and else",
            content: `Use \`if\` to choose what runs.

\`\`\`python
n = int(input())
if n % 15 == 0:
    print("FizzBuzz")
elif n % 3 == 0:
    print("Fizz")
elif n % 5 == 0:
    print("Buzz")
else:
    print(n)
\`\`\`

**Indentation matters** in Python: the indented block belongs to the line above it.

Comparison operators: \`==  !=  <  <=  >  >=\`. Combine conditions with \`and\`, \`or\`, \`not\`.`,
            problems: [],
          },
          {
            title: "Loops",
            content: `## for loops
\`\`\`python
for i in range(1, 6):   # 1, 2, 3, 4, 5
    print(i)
\`\`\`

## while loops
\`\`\`python
n = 10
while n > 0:
    n -= 3
\`\`\`

## break and continue
- \`break\` leaves the loop.
- \`continue\` skips to the next round.

Now combine loops with if/else to solve FizzBuzz.`,
            problems: ["fizzbuzz"],
          },
        ],
      },
      {
        title: "Functions and lists",
        lessons: [
          {
            title: "Functions",
            content: `Functions let you name a piece of logic and reuse it.

\`\`\`python
def area(width, height=1):
    return width * height

print(area(3, 4))   # 12
print(area(5))      # 5 (height defaults to 1)
\`\`\`

Keep functions small: one job each.`,
            problems: [],
          },
          {
            title: "Lists",
            content: `A list holds many values in order.

\`\`\`python
nums = [3, 9, 2, 7]
nums.append(4)
print(nums[0], nums[-1])   # 3 4
print(max(nums), sum(nums))
print(sorted(nums))        # [2, 3, 4, 7, 9]
\`\`\`

## Reading a list from input
\`\`\`python
n = int(input())
a = list(map(int, input().split()))
\`\`\``,
            problems: ["array-maximum"],
          },
        ],
      },
    ],
  },
  {
    slug: "cpp",
    title: "C++ Essentials",
    icon: "⚙️",
    level: "Beginner",
    description: "Fast, powerful C++ for problem solving: I/O, types, control flow, vectors and the STL.",
    modules: [
      {
        title: "Basics",
        lessons: [
          {
            title: "Program structure and I/O",
            content: `Every C++ program starts in \`main\`.

\`\`\`cpp
#include <bits/stdc++.h>
using namespace std;

int main() {
    long long a, b;
    cin >> a >> b;
    cout << a + b << "\\n";
    return 0;
}
\`\`\`

**Tip:** add these two lines at the top of \`main\` for fast input:

\`\`\`cpp
ios::sync_with_stdio(false);
cin.tie(nullptr);
\`\`\``,
            problems: ["sum-of-two-numbers"],
          },
          {
            title: "Types and overflow",
            content: `| Type | Range (approx.) |
|---|---|
| \`int\` | ±2·10⁹ |
| \`long long\` | ±9·10¹⁸ |
| \`double\` | 15 significant digits |

\`1000000000 + 1000000000\` **overflows** an \`int\`. When in doubt, use \`long long\`.`,
            problems: [],
          },
        ],
      },
      {
        title: "Control flow and the STL",
        lessons: [
          {
            title: "Loops and conditions",
            content: `\`\`\`cpp
for (int i = 1; i <= n; i++) {
    if (i % 15 == 0) cout << "FizzBuzz\\n";
    else if (i % 3 == 0) cout << "Fizz\\n";
    else if (i % 5 == 0) cout << "Buzz\\n";
    else cout << i << "\\n";
}
\`\`\`

Use \`"\\n"\` instead of \`endl\`: \`endl\` flushes output every time and is slow.`,
            problems: ["fizzbuzz"],
          },
          {
            title: "Vectors and algorithms",
            content: `\`vector\` is a resizable array.

\`\`\`cpp
int n; cin >> n;
vector<long long> a(n);
for (auto &x : a) cin >> x;

sort(a.begin(), a.end());
cout << *max_element(a.begin(), a.end());
\`\`\`

Other STL tools you'll use a lot: \`string\`, \`map\`, \`set\`, \`unordered_map\`, \`stack\`, \`queue\`, \`priority_queue\`.`,
            problems: ["array-maximum"],
          },
        ],
      },
    ],
  },
  {
    slug: "dsa",
    title: "Data Structures & Algorithms",
    icon: "🧠",
    level: "Intermediate",
    description: "The patterns behind interview problems: complexity, hashing, stacks, dynamic programming and graphs.",
    modules: [
      {
        title: "Foundations",
        lessons: [
          {
            title: "Time complexity (Big-O)",
            content: `Big-O describes how running time grows with input size **n**.

| Complexity | n = 10⁵ is… |
|---|---|
| O(n) | instant |
| O(n log n) | fast |
| O(n²) | ~10¹⁰ steps, **too slow** |

**Rule of thumb:** about 10⁸ simple steps per second. Read the constraints first, then pick an algorithm that fits.`,
            problems: [],
          },
          {
            title: "Hashing",
            content: `A hash map gives O(1) average lookup. Classic use: **Two Sum**.

\`\`\`python
seen = {}
for i, x in enumerate(a):
    if k - x in seen:
        print(seen[k - x], i)
        break
    seen[x] = i
\`\`\`

This turns an O(n²) "check every pair" into O(n).`,
            problems: ["two-sum-indices"],
          },
          {
            title: "Stacks",
            content: `A stack is last-in, first-out. It's perfect for matching brackets:

1. Push each opening bracket.
2. On a closing bracket, the top of the stack must be its partner. Pop it.
3. At the end the stack must be empty.

\`\`\`python
pairs = {")": "(", "]": "[", "}": "{"}
stack = []
for ch in s:
    if ch in pairs:
        if not stack or stack.pop() != pairs[ch]:
            print("NO"); break
    else:
        stack.append(ch)
\`\`\``,
            problems: ["valid-parentheses"],
          },
        ],
      },
      {
        title: "Advanced patterns",
        lessons: [
          {
            title: "Dynamic programming",
            content: `DP = break a problem into overlapping sub-problems and reuse their answers.

## Longest Increasing Subsequence
- **O(n²):** \`dp[i]\` = longest LIS ending at \`i\`.
- **O(n log n):** keep \`tails\`, where \`tails[k]\` is the smallest tail of an increasing subsequence of length \`k+1\`, and binary-search each number into it.

\`\`\`python
import bisect
tails = []
for x in a:
    i = bisect.bisect_left(tails, x)
    if i == len(tails): tails.append(x)
    else: tails[i] = x
print(len(tails))
\`\`\``,
            problems: ["longest-increasing-subsequence"],
          },
          {
            title: "Graphs and BFS",
            content: `Breadth-first search explores a graph layer by layer, so the first time it reaches a cell is via a **shortest path** (when every step costs 1).

\`\`\`python
from collections import deque
dist = [[-1]*c for _ in range(r)]
dist[0][0] = 0
q = deque([(0, 0)])
while q:
    x, y = q.popleft()
    for dx, dy in ((1,0),(-1,0),(0,1),(0,-1)):
        nx, ny = x+dx, y+dy
        if 0 <= nx < r and 0 <= ny < c and grid[nx][ny] == "." and dist[nx][ny] < 0:
            dist[nx][ny] = dist[x][y] + 1
            q.append((nx, ny))
\`\`\``,
            problems: ["shortest-path-grid"],
          },
        ],
      },
    ],
  },
  {
    slug: "machine-learning",
    title: "Machine Learning",
    icon: "🤖",
    level: "Advanced",
    description: "Core ML ideas with Python: data, models, training, evaluation and avoiding overfitting.",
    modules: [
      {
        title: "Foundations",
        lessons: [
          {
            title: "What is machine learning?",
            videoUrl: "https://www.youtube.com/watch?v=ukzFI9rgwfU",
            content: `Machine learning means **learning patterns from data** instead of writing rules by hand.

| Type | You have | Example |
|---|---|---|
| Supervised | inputs **and** correct answers | spam vs. not spam |
| Unsupervised | inputs only | grouping customers |
| Reinforcement | rewards from actions | game-playing agents |

A typical workflow: **collect data → clean → split → train → evaluate → improve.**`,
            problems: [],
          },
          {
            title: "Linear regression",
            content: `Linear regression fits a line \`y = w·x + b\` that minimises the squared error.

\`\`\`python
from sklearn.linear_model import LinearRegression
model = LinearRegression()
model.fit(X_train, y_train)
print(model.coef_, model.intercept_)
pred = model.predict(X_test)
\`\`\`

Training means adjusting \`w\` and \`b\` to reduce the **loss**. Gradient descent does this by repeatedly stepping downhill on the loss.`,
            problems: [],
          },
        ],
      },
      {
        title: "Building good models",
        lessons: [
          {
            title: "Train/test split and evaluation",
            content: `Never judge a model on the data it learned from.

\`\`\`python
from sklearn.model_selection import train_test_split
X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)
\`\`\`

Common metrics:
- **Regression:** MAE, RMSE, R².
- **Classification:** accuracy, precision, recall, F1.

On imbalanced data (e.g. 1% fraud), accuracy alone misleads. Check precision and recall.`,
            problems: [],
          },
          {
            title: "Overfitting and regularisation",
            content: `**Overfitting** means the model memorises the training data and fails on new data.

Signs: training score high, test score much lower.

Fixes:
1. More data.
2. A simpler model.
3. **Regularisation** (L1/Lasso, L2/Ridge), which penalises large weights.
4. **Cross-validation** to choose settings honestly.

\`\`\`python
from sklearn.linear_model import Ridge
from sklearn.model_selection import cross_val_score
print(cross_val_score(Ridge(alpha=1.0), X, y, cv=5).mean())
\`\`\``,
            problems: [],
          },
        ],
      },
    ],
  },
];
