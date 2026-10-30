// The daily live tests: one per Python chapter.
const q = (question, code, options, answer, explanation) => ({ question, code, options, answer, explanation });

export const PYTHON_CH1 = {
  title: "Python Live Test #1",
  topic: "Python · Chapter 1: Getting Started",
  durationMin: 10,
  questions: [
    q("Who created Python?", "", ["Dennis Ritchie", "Guido van Rossum", "James Gosling", "Bjarne Stroustrup"], 1,
      "Guido van Rossum created Python and first released it in 1991."),
    q("What is the output?", 'print("a", "b", "c", sep="-")', ["a b c", "abc", "a-b-c", "-a-b-c"], 2,
      "sep is placed between the values, so they are joined with '-'."),
    q("What is the output?", 'print("Loading", end="...")\nprint("done")',
      ["Loading done", "Loading...done", "Loading...\ndone", "Loading done..."], 1,
      "end replaces the newline, so the next print continues on the same line."),
    q("The user types 25. What is type(input())?", "", ["int", "float", "str", "number"], 2,
      "input() always returns a string. Convert it with int() to get a number."),
    q("The user types 5. What is the output?", "x = input()\nprint(x * 2)", ["10", "55", "5 5", "Error"], 1,
      'x is the string "5", and multiplying a string by 2 repeats it: "55".'),
    q("What is the output?", 'print(f"{3.14159:.2f}")', ["3.14159", "3.1", "3.14", "3.15"], 2,
      ":.2f rounds to 2 decimal places."),
    q("What is the output?", 'print(f"{7:03d}")', ["7", "007", "700", "0.07"], 1,
      ":03d pads the number with zeros to a width of 3."),
    q("The input is 3 5. What is the output?", "a, b = map(int, input().split())\nprint(a + b)", ["35", "8", "3 5", "Error"], 1,
      "split() gives ['3', '5'], map(int, ...) turns them into numbers, and 3 + 5 = 8."),
    q("Which symbol starts a comment in Python?", "", ["//", "/*", "#", "--"], 2,
      "Everything after # on a line is a comment."),
    q("How many spaces does PEP 8 recommend for one level of indentation?", "", ["2", "4", "8", "1 tab"], 1,
      "PEP 8, Python's style guide, recommends 4 spaces."),
    q("What happens when this code runs?", 'if True:\nprint("hi")', ["Prints hi", "SyntaxWarning", "IndentationError", "Nothing"], 2,
      "The body of an if must be indented. Without it Python raises IndentationError."),
    q("Which keyword is used as a placeholder for an empty block?", "", ["skip", "pass", "continue", "null"], 1,
      "A block can't be empty, so pass does nothing and keeps the syntax valid."),
    q("What does REPL stand for?", "", ["Run-Execute-Print-Loop", "Read-Eval-Print Loop", "Read-Execute-Program-Line", "Repeat-Eval-Print-Loop"], 1,
      "The interactive shell Reads a line, Evaluates it, Prints the result and Loops."),
    q("What does this give in the REPL?", '"py" * 3', ["'py3'", "'pypypy'", "Error", "'py py py'"], 1,
      "Multiplying a string by n repeats it n times."),
    q("What error do you get if you mix tabs and spaces in the same block?", "", ["SyntaxError", "SpaceError", "TabError", "ValueError"], 2,
      "Python raises TabError when a block mixes tabs and spaces inconsistently."),
  ],
};

// The second daily live test: Python chapter 2 (Variables & Data Types).
export const PYTHON_CH2 = {
  title: "Python Live Test #2",
  topic: "Python · Chapter 2: Variables & Data Types",
  durationMin: 10,
  questions: [
    q("Which of these is a valid variable name?", "", ["2nd_place", "my-name", "_total", "class"], 2,
      "Names may use letters, digits and _, but can't start with a digit, contain - or be a keyword like class."),
    q("What is the output?", "a = [1, 2]\nb = a\nb.append(3)\nprint(a)", ["[1, 2]", "[1, 2, 3]", "[3]", "Error"], 1,
      "b = a makes both names refer to the same list, so a change through b shows up in a."),
    q("What is the output?", "a, b = 1, 2\na, b = b, a\nprint(a, b)", ["1 2", "2 2", "2 1", "Error"], 2,
      "a, b = b, a swaps the two values in one step, with no temporary variable."),
    q("What is the output?", "first, *rest = [1, 2, 3, 4]\nprint(rest)", ["[2, 3, 4]", "2", "(2, 3, 4)", "[1, 2, 3]"], 0,
      "The starred name collects every remaining item into a list."),
    q("What is the output?", "print(7 // 2, -7 // 2)", ["3 -3", "3 -4", "3.5 -3.5", "4 -4"], 1,
      "// floors toward minus infinity, so -3.5 becomes -4, not -3."),
    q("What is the output?", "print(0.1 + 0.2 == 0.3)", ["True", "Error", "0.3", "False"], 3,
      "0.1 + 0.2 is 0.30000000000000004 in floating point. Use math.isclose() to compare floats."),
    q("What is the output?", "print(0xFF)", ["255", "FF", "0xFF", "15"], 0,
      "0x marks a hexadecimal literal, and FF in hex is 255."),
    q("What is the output?", "print(type(7 / 7))", ["<class 'int'>", "<class 'float'>", "<class 'bool'>", "<class 'complex'>"], 1,
      "/ is true division and always returns a float, even when it divides evenly (1.0)."),
    q("What is the output?", "print(True + True)", ["True", "TrueTrue", "Error", "2"], 3,
      "bool is a subclass of int: True is 1, so True + True is 2."),
    q("Which of these values is truthy?", "", ["0", '""', "[0]", "None"], 2,
      "[0] is a non-empty list, so it is truthy. 0, the empty string and None are all falsy."),
    q("What is the output?", 'print(bool("False"))', ["True", "False", "Error", "None"], 0,
      "Any non-empty string is truthy, even the text \"False\"."),
    q("What is the output?", 'print(None or "guest")', ["None", "guest", "True", "Error"], 1,
      "or returns the first truthy operand. None is falsy, so the result is \"guest\"."),
    q("What is the recommended way to check whether x is None?", "", ["x == None", "x = None", "x is None", "None(x)"], 2,
      "None is a single object, so PEP 8 says to compare with is: x is None."),
    q("What is the output?", "print(int(7.9))", ["7", "8", "7.9", "Error"], 0,
      "int() truncates toward zero. It doesn't round, so 7.9 becomes 7."),
    q("What is the output?", 'print("5" + 3)', ["8", "53", "TypeError", "5 3"], 2,
      "Python never converts between str and int automatically. Use int(\"5\") + 3 or \"5\" + str(3)."),
  ],
};

/** The next 5:30 PM in India (IST, UTC+5:30). */
export function next530pmIST(now = new Date()) {
  const ist = new Date(now.getTime() + 330 * 60_000);
  const at = new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate(), 17, 30) - 330 * 60_000);
  return at > now ? at : new Date(at.getTime() + 86_400_000);
}
