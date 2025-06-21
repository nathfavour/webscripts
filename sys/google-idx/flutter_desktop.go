package main

import (
	"fmt"
	"os"
	"os/exec"
)

func main() {
	cmd := exec.Command("sudo", "apt-get", "update")
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	fmt.Println("Running: sudo apt-get update")
	if err := cmd.Run(); err != nil {
		fmt.Println("Error:", err)
		return
	}

	installCmd := exec.Command("sudo", "apt-get", "install", "-y",
		"clang", "cmake", "git",
		"ninja-build", "pkg-config",
		"libgtk-3-dev", "liblzma-dev",
		"libstdc++-12-dev")
	installCmd.Stdout = os.Stdout
	installCmd.Stderr = os.Stderr
	fmt.Println("Running: sudo apt-get install ...")
	if err := installCmd.Run(); err != nil {
		fmt.Println("Error:", err)
	}
}
