// Starter subjects → chapters → topics, and where the starter questions live.
export const STRUCTURE = [
  {
    name: "Programming Fundamentals",
    icon: "🧩",
    chapters: [
      { name: "Basics", topics: ["Input & Output", "Loops"] },
      { name: "Strings", topics: ["String Basics"] },
    ],
  },
  {
    name: "Data Structures & Algorithms",
    icon: "🧠",
    chapters: [
      { name: "Arrays", topics: ["Array Basics", "Hashing"] },
      { name: "Stacks & Queues", topics: ["Stack"] },
      { name: "Dynamic Programming", topics: ["Subsequences"] },
      { name: "Graphs", topics: ["BFS"] },
    ],
  },
  {
    name: "Python",
    icon: "🐍",
    chapters: [
      { name: "Getting Started", topics: ["Introduction & Setup","Input & Output","Comments & Indentation"] },
      { name: "Variables & Data Types", topics: ["Variables & Naming","Numbers (int, float, complex)","Booleans & None","Type Conversion"] },
      { name: "Operators", topics: ["Arithmetic Operators","Comparison & Logical Operators","Assignment Operators","Bitwise Operators","Identity & Membership Operators","Operator Precedence"] },
      { name: "Control Flow", topics: ["if / elif / else","match-case","for Loops & range()","while Loops","break, continue & pass","Nested Loops & Patterns"] },
      { name: "Strings", topics: ["Indexing & Slicing","String Methods","f-strings & Formatting","Escape Characters & Raw Strings","String Problems (palindrome, anagram)"] },
      { name: "Lists", topics: ["List Basics","List Methods","List Comprehension","Nested Lists & 2D Lists","Sorting & Searching"] },
      { name: "Tuples & Sets", topics: ["Tuples","Packing & Unpacking","Sets","Set Operations"] },
      { name: "Dictionaries", topics: ["Dictionary Basics","Dictionary Methods","Dictionary Comprehension","Counting & Frequency"] },
      { name: "Functions", topics: ["Defining & Calling Functions","Arguments (default, keyword, *args, **kwargs)","Return Values","Scope (local, global, nonlocal)","Lambda Functions","Recursion","map, filter & reduce"] },
      { name: "Modules & Packages", topics: ["Importing Modules","Standard Library (math, random, datetime)","Creating Modules & Packages","pip & Virtual Environments"] },
      { name: "File Handling", topics: ["Reading & Writing Files","The with Statement","CSV Files","JSON Files","os & pathlib"] },
      { name: "Exception Handling", topics: ["try / except","else & finally","Raising Exceptions","Custom Exceptions"] },
      { name: "Object-Oriented Programming", topics: ["Classes & Objects","Constructors & Attributes","Instance, Class & Static Methods","Inheritance","Polymorphism","Encapsulation","Abstraction","Magic (Dunder) Methods","Dataclasses"] },
      { name: "Iterators & Generators", topics: ["Iterators","Generators & yield","Generator Expressions","itertools"] },
      { name: "Advanced Python", topics: ["Closures","Decorators","Context Managers","Type Hints","Regular Expressions","collections (deque, defaultdict, namedtuple, Counter)"] },
      { name: "Concurrency", topics: ["Threading","Multiprocessing","async / await"] },
      { name: "Testing & Best Practices", topics: ["Debugging","unittest & pytest","PEP 8 & Code Style","Logging"] },
    ],
  },
];

// slug → [subject, chapter, topic] plus learning extras for each starter question.
export const PLACEMENT = {
  "sum-of-two-numbers": {
    path: ["Programming Fundamentals", "Basics", "Input & Output"],
    hints: ["Read both numbers from one line and split on spaces.", "Use a 64-bit integer: the sum can reach 2·10⁹."],
    editorial: "Read `a` and `b`, print `a + b`. In C++/Java use `long long`/`long`, because `10⁹ + 10⁹` overflows a 32-bit int.",
    solution: "a, b = map(int, input().split())\nprint(a + b)\n",
  },
  fizzbuzz: {
    path: ["Programming Fundamentals", "Basics", "Loops"],
    hints: ["Loop from 1 to n.", "Check divisibility by 15 first, otherwise 3 and 5 would match before it."],
    editorial: "Loop `i` from 1 to `n`. Test `i % 15` first, then `i % 3`, then `i % 5`, else print `i`. **O(n)**.",
    solution:
      "n = int(input())\nout = []\nfor i in range(1, n + 1):\n    if i % 15 == 0: out.append('FizzBuzz')\n    elif i % 3 == 0: out.append('Fizz')\n    elif i % 5 == 0: out.append('Buzz')\n    else: out.append(str(i))\nprint('\\n'.join(out))\n",
  },
  "reverse-a-string": {
    path: ["Programming Fundamentals", "Strings", "String Basics"],
    companies: ["TCS", "Infosys"],
    hints: ["Most languages can reverse a string in one call.", "Or swap characters from both ends moving inwards."],
    editorial: "Python: `s[::-1]`. Otherwise use two pointers, `i` from the start and `j` from the end, swapping until they meet. **O(n)**.",
    solution: "print(input().strip()[::-1])\n",
  },
  "array-maximum": {
    path: ["Data Structures & Algorithms", "Arrays", "Array Basics"],
    hints: ["Keep the largest value seen so far.", "Start with the first element, not 0: all values may be negative."],
    editorial: "Scan once, keeping `best = max(best, x)`. Start `best` at the first element. **O(n)**.",
    solution: "n = int(input())\nprint(max(map(int, input().split()[:n])))\n",
  },
  "two-sum-indices": {
    path: ["Data Structures & Algorithms", "Arrays", "Hashing"],
    companies: ["Amazon", "Google", "Microsoft"],
    hints: ["For each number x you need k - x.", "A hash map from value to index answers 'have I seen k - x?' in O(1)."],
    editorial: "Walk the array once. For each `a[i]`, if `k - a[i]` is already in the map, print its index and `i`. Otherwise store `a[i] → i`. **O(n)** time.",
    solution:
      "n, k = map(int, input().split())\na = list(map(int, input().split()))\nseen = {}\nfor i, x in enumerate(a):\n    if k - x in seen:\n        print(seen[k - x], i)\n        break\n    seen[x] = i\n",
  },
  "valid-parentheses": {
    path: ["Data Structures & Algorithms", "Stacks & Queues", "Stack"],
    companies: ["Amazon", "Meta"],
    hints: ["The most recent unclosed bracket must close first. Which structure does that?", "At the end, nothing may remain open."],
    editorial: "Push opening brackets. On a closing bracket, the stack top must be its partner, so pop it. Valid if no mismatch and the stack ends empty. **O(n)**.",
    solution:
      "s = input().strip()\npairs = {')': '(', ']': '[', '}': '{'}\nstack = []\nok = True\nfor ch in s:\n    if ch in pairs:\n        if not stack or stack.pop() != pairs[ch]:\n            ok = False\n            break\n    else:\n        stack.append(ch)\nprint('YES' if ok and not stack else 'NO')\n",
  },
  "longest-increasing-subsequence": {
    path: ["Data Structures & Algorithms", "Dynamic Programming", "Subsequences"],
    companies: ["Google", "Amazon"],
    hints: ["O(n²) DP is too slow for n = 2·10⁵.", "Keep the smallest possible tail for each length, and binary search where each number goes."],
    editorial:
      "Maintain `tails`, where `tails[k]` is the smallest tail of an increasing subsequence of length `k+1`. For each `x`, binary-search the first tail `≥ x` and replace it (or append). The answer is `len(tails)`. **O(n log n)**.",
    solution:
      "import sys, bisect\nd = sys.stdin.read().split()\nn = int(d[0])\ntails = []\nfor x in map(int, d[1:n + 1]):\n    i = bisect.bisect_left(tails, x)\n    if i == len(tails): tails.append(x)\n    else: tails[i] = x\nprint(len(tails))\n",
  },
  "shortest-path-grid": {
    path: ["Data Structures & Algorithms", "Graphs", "BFS"],
    companies: ["Uber", "Amazon"],
    hints: ["Every move costs 1, so BFS finds shortest paths.", "Store each cell's distance and never visit a cell twice."],
    editorial: "Run BFS from (0,0) over open cells, recording distances. Print the distance of the bottom-right cell, or -1. **O(r·c)**.",
    solution:
      "import sys\nfrom collections import deque\nd = sys.stdin.read().split()\nr, c = int(d[0]), int(d[1])\ng = d[2:2 + r]\ndist = [[-1] * c for _ in range(r)]\ndist[0][0] = 0\nq = deque([(0, 0)])\nwhile q:\n    x, y = q.popleft()\n    for nx, ny in ((x+1, y), (x-1, y), (x, y+1), (x, y-1)):\n        if 0 <= nx < r and 0 <= ny < c and g[nx][ny] == '.' and dist[nx][ny] < 0:\n            dist[nx][ny] = dist[x][y] + 1\n            q.append((nx, ny))\nprint(dist[r-1][c-1])\n",
  },
};
