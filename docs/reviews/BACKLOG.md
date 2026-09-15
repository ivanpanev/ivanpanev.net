# Review backlog

Low and Nit findings from gauntlet reviews that were not fixed in their
milestone, plus operator actions the builder cannot perform. Each entry keeps
its original finding ID so it can be traced to the report that raised it.
Remove entries when fixed and reference the commit.

| Finding | Milestone | Severity | Summary | Status |
| --- | --- | --- | --- | --- |
| M0-R1-F20 | M0 | Nit | `C:\Users\doubl` (the operator's home directory) is an empty git repository; a `git add`/`commit` from the wrong directory would stage the home directory including `%APPDATA%\sops\age\keys.txt`. Operator action: `Remove-Item -Recurse -Force C:\Users\doubl\.git` if that repository is not intentional, or add `C:\Users\doubl\.gitignore` containing `*`. | Open (operator) |
