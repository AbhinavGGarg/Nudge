import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

function InterventionPopup({ intervention, onAction }) {
  const [detailText, setDetailText] = useState("");

  useEffect(() => {
    setDetailText("");
  }, [intervention?.id]);

  function handleAction(action) {
    if (!intervention) {
      return;
    }

    const nextDetail = onAction(intervention, action);
    if (nextDetail) {
      setDetailText(nextDetail);
    }
  }

  return (
    <AnimatePresence>
      {intervention ? (
        <motion.aside
          key={intervention.id}
          initial={{ opacity: 0, y: 24, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 16, scale: 0.96 }}
          transition={{ type: "spring", stiffness: 220, damping: 22 }}
          className="intervention-toast"
        >
          <div className="intervention-tag">Live Intervention</div>
          <h3>{intervention.title}</h3>

          <div className="intervention-why">
            <p>
              <strong>What:</strong> {intervention.message}
            </p>
            <p>
              <strong>Why:</strong> {intervention.reason}
            </p>
            <p>
              <strong>Next:</strong> {intervention.nextAction}
            </p>
          </div>

          <div className="intervention-impact">
            <strong>Impact Estimate:</strong> {intervention.impactBefore || "~5 min wasted"} {" -> "}
            {intervention.impactAfter || "~2 min after intervention"}
          </div>

          <div className="intervention-actions">
            <button className="btn btn-primary" onClick={() => handleAction("show_fix")}>Show Fix</button>
            <button className="btn btn-ghost" onClick={() => handleAction("give_hint")}>Give Hint</button>
            <button className="btn btn-primary" onClick={() => handleAction("refocus")}>Refocus</button>
            <button className="btn btn-ghost" onClick={() => handleAction("summarize")}>Summarize</button>
          </div>

          {detailText ? <div className="intervention-detail">{detailText}</div> : null}
        </motion.aside>
      ) : null}
    </AnimatePresence>
  );
}

export default InterventionPopup;
