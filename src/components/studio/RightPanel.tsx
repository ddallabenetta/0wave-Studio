"use client";

/**
 * RightPanel: shared collapsible tabbed chrome for the right lateral space in
 * both Studio and Playground (Analyzer | AI Connector / Inspector | Library |
 * AI Connector).
 *
 * Expanded: a tab strip (SegmentedControl) plus the active tab's content.
 * Collapsed: a slim vertical strip of tab icons so the user can reopen either
 * tab, plus an expand control at the bottom. Tab state lives in ui-store; the
 * panel itself is stateless and reports changes up.
 */
import type { ReactNode } from "react";
import { CaretLeft, CaretRight } from "@phosphor-icons/react";
import { IconButton, SegmentedControl } from "@/components/controls";
import { strings } from "@/i18n";

export interface RightPanelTab<T extends string> {
  value: T;
  /** User-facing tab name (i18n). */
  label: string;
  /** Icon shown in the collapsed strip. */
  icon: ReactNode;
  content: ReactNode;
}

interface RightPanelProps<T extends string> {
  tabs: ReadonlyArray<RightPanelTab<T>>;
  activeTab: T;
  onTabChange: (tab: T) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Tailwind width class of the expanded panel, e.g. "w-[300px]". */
  widthClass: string;
}

export function RightPanel<T extends string>({
  tabs,
  activeTab,
  onTabChange,
  open,
  onOpenChange,
  widthClass,
}: RightPanelProps<T>) {
  const active = tabs.find((tab) => tab.value === activeTab);
  // Static aria name for the tab strip, matching the existing pattern of
  // hardcoded English aria-labels on SegmentedControls ("Studio mode", …).
  const TABS_ARIA_LABEL = "Right panel tabs";

  return (
    <aside
      className={`flex shrink-0 flex-col overflow-hidden border-l border-edge bg-base ${
        open ? widthClass : "w-8"
      }`}
    >
      {open ? (
        <>
          <header className="flex h-9 shrink-0 items-center gap-1 border-b border-edge px-2">
            <SegmentedControl
              label={TABS_ARIA_LABEL}
              size="sm"
              options={tabs.map((tab) => ({ value: tab.value, label: tab.label }))}
              value={activeTab}
              onChange={onTabChange}
            />
            <IconButton
              size="sm"
              variant="ghost"
              aria-label={strings.rightPanel.collapse}
              icon={<CaretRight size={13} weight="bold" />}
              onClick={() => onOpenChange(false)}
              className="ml-auto"
            />
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto p-2">{active?.content}</div>
        </>
      ) : (
        <div className="flex w-8 flex-col items-center gap-1 py-2">
          {tabs.map((tab) => (
            <IconButton
              key={tab.value}
              size="sm"
              variant="ghost"
              aria-label={tab.label}
              icon={tab.icon}
              onClick={() => {
                onTabChange(tab.value);
                onOpenChange(true);
              }}
            />
          ))}
          <IconButton
            size="sm"
            variant="ghost"
            aria-label={strings.rightPanel.expand}
            icon={<CaretLeft size={13} weight="bold" />}
            onClick={() => onOpenChange(true)}
            className="mt-auto"
          />
        </div>
      )}
    </aside>
  );
}
