export const getBrazilianDate = () => {
  const now = new Date();

  const brazilTime = new Date(now.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
  return brazilTime;
};
