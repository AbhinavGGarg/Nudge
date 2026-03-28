import { AnimatePresence, motion } from "framer-motion";

function InterventionPopup({ intervention, onApply, onDismiss }) {
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
          <p>{intervention.message}</p>
          <div className="intervention-note">
            <strong>Next action:</strong> {intervention.nextAction}
          </div>
          <div className="intervention-actions">
            <button className="btn btn-primary" onClick={() => onApply(intervention)}>
              Apply Support Path
            </button>
            <button className="btn btn-ghost" onClick={() => onDismiss(intervention.id)}>
              Dismiss
            </button>
          </div>
        </motion.aside>
      ) : null}
    </AnimatePresence>
  );
}

export default InterventionPopup;
