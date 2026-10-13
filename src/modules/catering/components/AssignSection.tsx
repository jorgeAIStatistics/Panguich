import { daysBetweenIsoDates, formatIsoDate } from "@/lib/time";
import { assignAction, setFollowUpAction } from "../owner-actions";
import { personName, type DetailView } from "./detail-view";
import { FlashMessage } from "./FlashMessage";
import styles from "./owner.module.css";

/** Who has the request, and the day to get back to the customer. */
export function AssignSection(view: DetailView) {
  const { detail, t, locale, perms } = view;
  const { inquiry } = detail;
  const a = t.assign;
  const followUpLabel =
    detail.followUp === "due"
      ? a.dueToday
      : detail.followUp === "overdue" && inquiry.followUpOn
        ? a.overdue(daysBetweenIsoDates(inquiry.followUpOn, detail.today))
        : null;

  return (
    <section className={`o-section ${styles.anchor}`} id="assign" aria-labelledby="assign-title">
      <h2 id="assign-title">{a.title}</h2>
      <div className="o-card o-stack">
        <FlashMessage flash={view.flash} at="assign" />
        {perms.manage ? (
          <>
            <form action={assignAction} className={styles.inline}>
              <input type="hidden" name="inquiryId" value={inquiry.id} />
              <div className={`o-field ${styles.grow}`}>
                <label htmlFor="assignee">{a.assignee}</label>
                <select className="o-select" id="assignee" name="assigneeId" defaultValue={inquiry.assigneeId ?? ""}>
                  <option value="">{a.nobody}</option>
                  {detail.people.map((person) => (
                    <option key={person.id} value={person.id}>
                      {person.name}
                    </option>
                  ))}
                </select>
              </div>
              <button className="o-btn" type="submit">
                {a.saveAssignee}
              </button>
            </form>

            <form action={setFollowUpAction} className="o-stack o-stack--tight">
              <input type="hidden" name="inquiryId" value={inquiry.id} />
              <div className={styles.inline}>
                <div className={`o-field ${styles.grow}`}>
                  <label htmlFor="follow-up">{a.followUp}</label>
                  <input
                    className="o-input"
                    id="follow-up"
                    name="followUpOn"
                    type="date"
                    defaultValue={inquiry.followUpOn ?? ""}
                    aria-describedby="follow-up-hint"
                  />
                </div>
                <button className="o-btn" type="submit">
                  {a.saveDate}
                </button>
                {inquiry.followUpOn ? (
                  <button className="o-btn o-btn--quiet" type="submit" name="clear" value="1">
                    {a.clearDate}
                  </button>
                ) : null}
              </div>
              <span className="o-meta" id="follow-up-hint">
                {a.followUpHint}
              </span>
            </form>
          </>
        ) : (
          <dl className="o-facts">
            <dt>{a.assignee}</dt>
            <dd>{inquiry.assigneeId ? personName(view, inquiry.assigneeId) : a.nobody}</dd>
            <dt>{a.followUp}</dt>
            <dd>{inquiry.followUpOn ? formatIsoDate(inquiry.followUpOn, locale) : a.none}</dd>
          </dl>
        )}
        {followUpLabel ? (
          <p className={styles.flag} data-testid="follow-up-flag">
            {followUpLabel}
          </p>
        ) : null}
      </div>
    </section>
  );
}
