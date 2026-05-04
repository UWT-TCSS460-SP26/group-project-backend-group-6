import { Request, Response } from 'express';
import { prisma } from '../../lib/prisma';

export const createIssue = async (req: Request, res: Response) => {
  const { title, description, reporterContact } = req.body;

  if (!title || !description) {
    return res.status(400).json({
      error: 'title and description are required',
    });
  }

  const issue = await prisma.issue.create({
    data: {
      title,
      description,
      reporterContact,
    },
  });

  res.status(201).json(issue);
};
