// file: routes/exams.ts
app.post('/api/exams/:examId/submit', async (req: Request, res: Response) => {
  const { examId } = req.params;
  const { studentName, studentEmail, answers } = req.body; // answers = Array<{ questionId: string, selection: any }>

  try {
    const exam = await prisma.exam.findUnique({
      where: { id: examId },
      include: { questions: true },
    });

    if (!exam) return res.status(404).json({ error: 'Target exam not found.' });

    let score = 0;
    const totalPoints = exam.questions.reduce((sum, q) => sum + q.points, 0);

    const questionResults = exam.questions.map((question) => {
      const studentAnswer = answers.find((ans: any) => ans.questionId === question.id);
      const isCorrect = JSON.stringify(studentAnswer?.selection) === JSON.stringify(question.correctAnswer);

      if (isCorrect) {
        score += question.points;
      } else if (exam.negativeMarking > 0) {
        score -= exam.negativeMarking;
      }

      return {
        questionId: question.id,
        isCorrect,
        pointsAwarded: isCorrect ? question.points : (exam.negativeMarking > 0 ? -exam.negativeMarking : 0),
      };
    });

    const scorePercent = (score / totalPoints) * 100;
    const passed = scorePercent >= exam.passingPercentage;

    const result = await prisma.result.create({
      data: {
        examId,
        studentName,
        studentEmail,
        scoreObtained: Math.max(0, score),
        totalScore: totalPoints,
        passed,
      },
    });

    let certificate = null;
    if (passed) {
      const certCode = `NEHC-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;
      certificate = await prisma.certificate.create({
        data: {
          resultId: result.id,
          certificateCode: certCode,
          studentName,
          courseTitle: exam.title,
          signatureUrl: '/assets/signatures/director.png',
          qrCodeData: `https://nehc.gov.in/verify/${certCode}`,
        },
      });
    }

    return res.json({ result, passed, score, totalPoints, certificate, breakdown: questionResults });
  } catch (err: any) {
    return res.status(500).json({ error: 'Processing submission failed.' });
  }
});
