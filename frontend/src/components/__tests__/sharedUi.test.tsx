import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test } from "vitest";
import { Button } from "../shared/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../shared/ui/dialog";
import { PasswordInput } from "../shared/ui/password-input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../shared/ui/tabs";

describe("Button", () => {
  test("renders default variant", () => {
    render(<Button>click</Button>);
    expect(screen.getByRole("button", { name: "click" })).toBeInTheDocument();
  });

  test("renders custom variant + size", () => {
    render(
      <Button variant="destructive" size="lg">
        delete
      </Button>,
    );
    const btn = screen.getByRole("button", { name: "delete" });
    expect(btn.className).toContain("bg-destructive");
    expect(btn.className).toContain("h-11");
  });

  test("asChild renders the child element", () => {
    render(
      <Button asChild>
        <a href="/foo">link</a>
      </Button>,
    );
    expect(screen.getByRole("link", { name: "link" })).toBeInTheDocument();
  });
});

describe("PasswordInput", () => {
  test("toggles visibility", async () => {
    const user = userEvent.setup();
    render(<PasswordInput aria-label="pwd" defaultValue="abc" />);
    const input = screen.getByLabelText("pwd") as HTMLInputElement;
    expect(input.type).toBe("password");
    await user.click(screen.getByLabelText(/show password/i));
    expect(input.type).toBe("text");
    await user.click(screen.getByLabelText(/hide password/i));
    expect(input.type).toBe("password");
  });
});

describe("Dialog primitives", () => {
  test("renders header, title, description, footer when open", () => {
    render(
      <Dialog open>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Hi</DialogTitle>
            <DialogDescription>desc</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <button type="button">ok</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>,
    );
    expect(screen.getByText("Hi")).toBeInTheDocument();
    expect(screen.getByText("desc")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "ok" })).toBeInTheDocument();
  });
});

describe("Tabs primitives", () => {
  test("switches active panel on tab click", async () => {
    const user = userEvent.setup();
    render(
      <Tabs defaultValue="a">
        <TabsList>
          <TabsTrigger value="a">A</TabsTrigger>
          <TabsTrigger value="b">B</TabsTrigger>
        </TabsList>
        <TabsContent value="a">panel a</TabsContent>
        <TabsContent value="b">panel b</TabsContent>
      </Tabs>,
    );
    expect(screen.getByText("panel a")).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "B" }));
    expect(screen.getByText("panel b")).toBeInTheDocument();
  });
});
