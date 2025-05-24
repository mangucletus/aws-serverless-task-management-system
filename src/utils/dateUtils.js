/**
 * Format a date string to a more readable format
 * @param {string} dateString - ISO date string
 * @returns {string} Formatted date string
 */
export const formatDate = (dateString) => {
  if (!dateString) return "";
  
  const date = new Date(dateString);
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
};

/**
 * Calculate days until a deadline
 * @param {string} deadlineString - ISO date string of the deadline
 * @returns {number} Number of days until the deadline
 */
export const getDaysUntilDeadline = (deadlineString) => {
  if (!deadlineString) return 0;
  
  const deadline = new Date(deadlineString);
  const today = new Date();
  
  // Reset hours to compare just the dates
  today.setHours(0, 0, 0, 0);
  deadline.setHours(0, 0, 0, 0);
  
  const diffTime = deadline - today;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  
  return diffDays < 0 ? 0 : diffDays;
};

/**
 * Check if a deadline is overdue
 * @param {string} deadlineString - ISO date string of the deadline
 * @returns {boolean} True if deadline is in the past
 */
export const isDeadlineOverdue = (deadlineString) => {
  if (!deadlineString) return false;
  
  const deadline = new Date(deadlineString);
  const today = new Date();
  
  return deadline < today;
};

/**
 * Format a date as a relative time (e.g., "2 days ago", "Just now")
 * @param {string} dateString - ISO date string
 * @returns {string} Relative time string
 */
export const getRelativeTime = (dateString) => {
  if (!dateString) return "";
  
  const date = new Date(dateString);
  const now = new Date();
  const diffTime = now - date;
  const diffMinutes = Math.floor(diffTime / (1000 * 60));
  const diffHours = Math.floor(diffTime / (1000 * 60 * 60));
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  
  if (diffMinutes < 1) {
    return "Just now";
  } else if (diffMinutes < 60) {
    return `${diffMinutes} minute${diffMinutes === 1 ? "" : "s"} ago`;
  } else if (diffHours < 24) {
    return `${diffHours} hour${diffHours === 1 ? "" : "s"} ago`;
  } else if (diffDays < 30) {
    return `${diffDays} day${diffDays === 1 ? "" : "s"} ago`;
  } else {
    return formatDate(dateString);
  }
};