import { motion, useReducedMotion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { SutaeruIcon } from "@/components/SutaeruIcon";
import type { PlanDirection } from "@/types/chat";

interface PlanOptionCardsProps {
  options: PlanDirection[];
  selectedId?: string;
  disabled?: boolean;
  onSelect: (option: PlanDirection) => void;
}

export function PlanOptionCards({ options, selectedId, disabled = false, onSelect }: PlanOptionCardsProps) {
  const reduceMotion = useReducedMotion();

  return (
    <section className="sutaeru-plan" aria-label="Visual directions">
      <header className="sutaeru-plan-heading">
        <div>
          <span>Visual planning / 03 directions</span>
          <h3>Choose a direction</h3>
        </div>
        <SutaeruIcon name="plan" className="h-8 w-8" />
      </header>
      <div className="sutaeru-plan-grid">
        {options.map((option, index) => {
          const selected = selectedId === option.id;
          return (
            <motion.article
              key={option.id}
              initial={reduceMotion ? false : { y: 8 }}
              animate={{ y: 0 }}
              transition={{ delay: reduceMotion ? 0 : index * 0.07 }}
              className="sutaeru-plan-card"
              data-selected={selected || undefined}
            >
              <div className={`sutaeru-plan-preview sutaeru-plan-preview-${index + 1}`} aria-hidden="true">
                <div className="sutaeru-plan-preview-mark"><SutaeruIcon name={index === 0 ? "research" : index === 1 ? "make" : "models"} /></div>
                <div className="sutaeru-plan-preview-copy"><i /><i /><i /></div>
                <div className="sutaeru-plan-preview-index">0{index + 1}</div>
              </div>
              <div className="sutaeru-plan-card-copy">
                <div className="sutaeru-plan-card-title">
                  <h4>{option.title}</h4>
                  {option.recommended ? <span>Recommended</span> : null}
                </div>
                <p>{option.concept}</p>
                <div className="sutaeru-plan-palette" aria-label="Palette">
                  {option.palette.map((color) => <i key={color} style={{ background: color }} />)}
                  <span>{option.emphasis}</span>
                </div>
                <div className="sutaeru-plan-tags">{option.tags.map((tag) => <span key={tag}>{tag}</span>)}</div>
                <Button
                  type="button"
                  variant={selected ? "default" : "outline"}
                  disabled={disabled || (!!selectedId && !selected)}
                  onClick={() => onSelect(option)}
                  className="sutaeru-plan-select"
                >
                  <SutaeruIcon name={selected ? "check" : "arrow"} signal={selected} />
                  {selected ? "Direction selected" : "Choose direction"}
                </Button>
              </div>
            </motion.article>
          );
        })}
      </div>
    </section>
  );
}