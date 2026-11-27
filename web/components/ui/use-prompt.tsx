"use client";

import { useCallback, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

type PromptResolver = (value: string | null) => void;
type ConfirmResolver = (value: boolean) => void;
type ChoiceResolver = (value: string | null) => void;

export type ChoiceOption = {
  label: string;
  value: string;
  danger?: boolean;
};

/**
 * 应用内 prompt / confirm 对话框，替代 window.prompt / window.confirm。
 * 后者在部分嵌入 / 沙箱浏览器里会被禁用并抛 "prompt() is not supported"。
 *
 * 用法：
 *   const { prompt, confirm, dialogs } = usePrompt();
 *   const name = await prompt("画板名称", "默认名");   // string | null
 *   if (await confirm("确定删除？")) { ... }          // boolean
 *   在 JSX 中渲染 {dialogs}
 */
export function usePrompt() {
  const promptResolver = useRef<PromptResolver | null>(null);
  const confirmResolver = useRef<ConfirmResolver | null>(null);
  const choiceResolver = useRef<ChoiceResolver | null>(null);
  const [promptTitle, setPromptTitle] = useState<string | null>(null);
  const [confirmMessage, setConfirmMessage] = useState<string | null>(null);
  const [choice, setChoice] = useState<{ title: string; message?: string; options: ChoiceOption[] } | null>(null);
  const [value, setValue] = useState("");

  const prompt = useCallback((title: string, defaultValue = "") => {
    return new Promise<string | null>((resolve) => {
      promptResolver.current = resolve;
      setValue(defaultValue);
      setPromptTitle(title);
    });
  }, []);

  const confirm = useCallback((message: string) => {
    return new Promise<boolean>((resolve) => {
      confirmResolver.current = resolve;
      setConfirmMessage(message);
    });
  }, []);

  const closePrompt = useCallback((result: string | null) => {
    promptResolver.current?.(result);
    promptResolver.current = null;
    setPromptTitle(null);
  }, []);

  const closeConfirm = useCallback((result: boolean) => {
    confirmResolver.current?.(result);
    confirmResolver.current = null;
    setConfirmMessage(null);
  }, []);

  /** 多选一对话框（比如「删整卷 / 把章节挪到默认卷」）。返回选项 value 或 null。 */
  const choose = useCallback((title: string, options: ChoiceOption[], message?: string) => {
    return new Promise<string | null>((resolve) => {
      choiceResolver.current = resolve;
      setChoice({ title, options, message });
    });
  }, []);

  const closeChoice = useCallback((result: string | null) => {
    choiceResolver.current?.(result);
    choiceResolver.current = null;
    setChoice(null);
  }, []);

  const dialogs = (
    <>
      <Dialog open={promptTitle !== null} onOpenChange={(open) => { if (!open) closePrompt(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{promptTitle}</DialogTitle>
          </DialogHeader>
          <Input
            value={value}
            onChange={(event) => setValue(event.target.value)}
            autoFocus
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                closePrompt(value);
              }
            }}
          />
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => closePrompt(null)}>取消</Button>
            <Button onClick={() => closePrompt(value)}>确定</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={confirmMessage !== null} onOpenChange={(open) => { if (!open) closeConfirm(false); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>确认</DialogTitle>
          </DialogHeader>
          <p className="text-sm leading-6 text-zinc-600">{confirmMessage}</p>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => closeConfirm(false)}>取消</Button>
            <Button onClick={() => closeConfirm(true)}>确定</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={choice !== null} onOpenChange={(open) => { if (!open) closeChoice(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{choice?.title ?? ""}</DialogTitle>
          </DialogHeader>
          {choice?.message && <p className="text-sm leading-6 text-zinc-600">{choice.message}</p>}
          <DialogFooter className="flex-col gap-2 sm:flex-col">
            {choice?.options.map((option) => (
              <Button
                key={option.value}
                variant={option.danger ? "destructive" : "outline"}
                className="w-full"
                onClick={() => closeChoice(option.value)}
              >
                {option.label}
              </Button>
            ))}
            <Button variant="ghost" className="w-full" onClick={() => closeChoice(null)}>
              取消
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );

  return { prompt, confirm, choose, dialogs };
}
