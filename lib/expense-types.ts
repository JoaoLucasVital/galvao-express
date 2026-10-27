export const EXPENSE_CATEGORY_LABEL = {
  personal_hygiene: "Higiene pessoal",
  breakfast: "Café da manhã",
  lunch: "Almoço",
  dinner: "Janta",
  varied: "Variados",
} as const;

export type ExpenseCategory = keyof typeof EXPENSE_CATEGORY_LABEL;

export type Expense = {
  id: number;
  category: ExpenseCategory;
  expenseDate: string;
  amount: number;
  notes: string;
  createdAt?: string;
};

export type ExpenseDraft = {
  category: ExpenseCategory;
  expenseDate: string;
  amount: string;
  notes: string;
};

export function isExpenseCategory(value: unknown): value is ExpenseCategory {
  return typeof value === "string" && value in EXPENSE_CATEGORY_LABEL;
}

export function normalizeExpense(value: Partial<Expense>): Expense {
  return {
    id: Number(value.id) || Date.now(),
    category: isExpenseCategory(value.category) ? value.category : "varied",
    expenseDate: String(value.expenseDate ?? ""),
    amount: Number(value.amount) || 0,
    notes: String(value.notes ?? ""),
    createdAt: value.createdAt,
  };
}
