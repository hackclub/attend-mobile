/**
 * The largest Dynamic Type / font scale applied to compact chrome text:
 * segment labels, badges, pills, chips. Their containers have a fixed shape,
 * so past this they clip or wrap instead of getting more readable; body text
 * and buttons keep scaling without a cap.
 */
export const CHROME_MAX_FONT_SCALE = 1.4;
