#!/bin/zsh
set -e
task_root="${0:A:h}"
"$task_root/macos/build.sh" --universal --install
print "\n完成。可从“应用程序”打开“叠影”。"
print "按回车关闭此窗口。"
read -r
