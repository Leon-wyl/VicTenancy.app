"use client";

import * as React from "react";
import Link from "next/link";
import { Menu } from "lucide-react";
import { LandingMark } from "@/components/landing/landing-mark";
import {
  Sheet,
  SheetContent,
  SheetTrigger,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { SidebarContent } from "./sidebar-content";

export function MobileNav({ email }: { email: string }) {
  const [open, setOpen] = React.useState(false);

  return (
    <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-ink/10 bg-warm-white/90 px-4 backdrop-blur-md lg:hidden">
      <Link href="/app" aria-label="VicTenancy home">
        <LandingMark />
      </Link>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Open navigation menu"
          >
            <Menu className="h-5 w-5" aria-hidden="true" />
          </Button>
        </SheetTrigger>
        <SheetContent side="right" className="p-0">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <SheetDescription className="sr-only">
            Account and conversations navigation
          </SheetDescription>
          <div
            className="h-full overflow-y-auto"
            style={{ overscrollBehavior: "contain" }}
          >
            <SidebarContent email={email} onSignedOut={() => setOpen(false)} />
          </div>
        </SheetContent>
      </Sheet>
    </header>
  );
}
