import { api } from './api'
import type { Day, MealPlanRun } from './types'

/**
 * Our meal plans, newest first: each started on whatever night we chose and
 * running as many nights as we said. The newest is the current plan.
 */
export const plans = $state({ list: [] as MealPlanRun[], loaded: false, error: '' })

export async function loadPlans(): Promise<void> {
  try {
    plans.list = (await api.plans()).plans
    plans.error = ''
  } catch (e) {
    plans.error = e instanceof Error ? e.message : String(e)
  } finally {
    plans.loaded = true
  }
}

export const currentPlan = (): MealPlanRun | undefined => plans.list[0]

/** The plan holding a night, if any. */
export const planHolding = (day: Day): MealPlanRun | undefined => plans.list.find((p) => p.start <= day && day <= p.end)

export async function startPlan(start: Day, nights = 7): Promise<MealPlanRun> {
  const r = await api.startPlan(start, nights)
  plans.list = r.plans
  return r.plan
}

export async function setPlanNights(id: string, nights: number): Promise<MealPlanRun> {
  const r = await api.setPlanNights(id, nights)
  plans.list = r.plans
  return r.plan
}
