/**
 * Monthly Generation Hook
 * =======================
 * 
 * React hook for triggering automatic monthly financial generation.
 * Use this in pages that need to regenerate financial records.
 */
import { useCallback, useState } from "react";
import { generateMonthlyFinancials, regenerateMonthlyFinancials } from "@/lib/calculations/monthly-engine";
import type { MonthlyGenerationResult } from "@/lib/calculations/monthly-engine";
import { toast } from "sonner";

export function useMonthlyGeneration() {
  const [isGenerating, setIsGenerating] = useState(false);
  const [lastResult, setLastResult] = useState<MonthlyGenerationResult | null>(null);

  const generate = useCallback(async (ym: string, uid?: string) => {
    setIsGenerating(true);
    try {
      const result = await generateMonthlyFinancials(ym, uid);
      setLastResult(result);
      
      if (result.reconciliation.balanced) {
        let msg = `Generated: ${result.chargesGenerated} charges, ${result.internalPaymentsGenerated} internal payments, ${result.advancesCreated} advances`;
        if (result.expensesDeduped > 0 || result.bazarDeduped > 0) {
          msg += ` (cleaned ${result.expensesDeduped} duplicate expenses, ${result.bazarDeduped} duplicate bazar entries)`;
        }
        if (result.duplicateWarnings.length > 0) {
          toast.warning(result.duplicateWarnings.join(" | "), { duration: 6000 });
        }
        toast.success(msg);
      } else {
        toast.warning(
          `Generated with ${result.reconciliation.errors.length} issues. Check reconciliation.`
        );
      }
      
      return result;
    } catch (error) {
      toast.error(`Generation failed: ${(error as Error).message}`);
      throw error;
    } finally {
      setIsGenerating(false);
    }
  }, []);

  const regenerate = useCallback(async (ym: string, uid?: string) => {
    setIsGenerating(true);
    try {
      const result = await regenerateMonthlyFinancials(ym, uid);
      setLastResult(result);
      
      if (result.reconciliation.balanced) {
        let msg = `Regenerated: ${result.chargesGenerated} charges, ${result.internalPaymentsGenerated} internal payments`;
        if (result.expensesDeduped > 0 || result.bazarDeduped > 0) {
          msg += ` (cleaned ${result.expensesDeduped} duplicate expenses, ${result.bazarDeduped} duplicate bazar entries)`;
        }
        if (result.duplicateWarnings.length > 0) {
          toast.warning(result.duplicateWarnings.join(" | "), { duration: 6000 });
        }
        toast.success(msg);
      } else {
        toast.warning(
          `Regenerated with ${result.reconciliation.errors.length} issues.`
        );
      }
      
      return result;
    } catch (error) {
      toast.error(`Regeneration failed: ${(error as Error).message}`);
      throw error;
    } finally {
      setIsGenerating(false);
    }
  }, []);

  return {
    generate,
    regenerate,
    isGenerating,
    lastResult,
  };
}