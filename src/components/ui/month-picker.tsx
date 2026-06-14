import { useState, useMemo } from "react";
import { format, setMonth, setYear, startOfMonth } from "date-fns";
import { CalendarIcon, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

interface MonthPickerProps {
  value: string; // "YYYY-MM" format
  onChange: (value: string) => void;
  className?: string;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function MonthPicker({ value, onChange, className }: MonthPickerProps) {
  const [open, setOpen] = useState(false);
  const [viewDate, setViewDate] = useState(() => {
    if (value) {
      const [y, m] = value.split("-").map(Number);
      return new Date(y, (m || 1) - 1);
    }
    return new Date();
  });

  const [selectMode, setSelectMode] = useState<"month" | "year">("month");

  const selectedYear = viewDate.getFullYear();
  const selectedMonth = parseInt(value.split("-")[1] || "1", 10) - 1;
  const selectedYearFromValue = parseInt(value.split("-")[0] || String(new Date().getFullYear()), 10);

  const yearRange = useMemo(() => {
    const currentYear = new Date().getFullYear();
    const startYear = Math.min(selectedYear, currentYear) - 5;
    const endYear = Math.max(selectedYear, currentYear) + 5;
    return Array.from({ length: endYear - startYear + 1 }, (_, i) => startYear + i);
  }, [selectedYear]);

  const handleMonthSelect = (monthIndex: number) => {
    const ym = `${selectedYear}-${String(monthIndex + 1).padStart(2, "0")}`;
    onChange(ym);
    setOpen(false);
  };

  const handleYearSelect = (year: number) => {
    setViewDate(new Date(year, 0));
    setSelectMode("month");
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" className={cn("w-[180px] justify-start text-left font-normal gap-2", className)}>
          <CalendarIcon className="h-4 w-4 shrink-0 opacity-50" />
          <span>{value ? format(new Date(parseInt(value.split("-")[0]), parseInt(value.split("-")[1]) - 1), "MMM yyyy") : "Pick month"}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-3" align="start">
        {selectMode === "month" ? (
          <div className="space-y-3">
            {/* Year navigation */}
            <div className="flex items-center justify-between">
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setViewDate(new Date(selectedYear - 1, 0))}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="sm" className="text-sm font-semibold" onClick={() => setSelectMode("year")}>
                {selectedYear}
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setViewDate(new Date(selectedYear + 1, 0))}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
            {/* Month grid */}
            <div className="grid grid-cols-3 gap-2">
              {MONTHS.map((month, idx) => {
                const isSelected = idx === selectedMonth && selectedYear === selectedYearFromValue;
                const isCurrentMonth = idx === new Date().getMonth() && selectedYear === new Date().getFullYear();
                return (
                  <Button
                    key={month}
                    variant={isSelected ? "default" : "ghost"}
                    size="sm"
                    className={cn(
                      "h-9 text-xs font-medium",
                      isCurrentMonth && !isSelected && "border border-dashed border-primary/40",
                    )}
                    onClick={() => handleMonthSelect(idx)}
                  >
                    {month}
                  </Button>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {/* Year range navigation */}
            <div className="flex items-center justify-between">
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setViewDate(new Date(selectedYear - 10, 0))}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm font-semibold">{yearRange[0]} - {yearRange[yearRange.length - 1]}</span>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setViewDate(new Date(selectedYear + 10, 0))}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
            {/* Year grid */}
            <div className="grid grid-cols-3 gap-2">
              {yearRange.map((year) => {
                const isSelected = year === selectedYearFromValue;
                return (
                  <Button
                    key={year}
                    variant={isSelected ? "default" : "ghost"}
                    size="sm"
                    className="h-9 text-xs font-medium"
                    onClick={() => handleYearSelect(year)}
                  >
                    {year}
                  </Button>
                );
              })}
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}