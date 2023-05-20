import { NextApiRequest, NextApiResponse } from 'next';
import fs from 'fs';
import path from 'path';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'POST') {
    const { code, fileName } = req.body;
    const filePath = path.join(process.cwd(), 'code-snippets', `${fileName}.txt`);

    fs.writeFile(filePath, code, (err) => {
      if (err) {
        console.error(err);
        res.status(500).json({ message: 'Error saving code snippet' });
      } else {
        res.status(200).json({ message: 'Code snippet saved successfully' });
      }
    });
  } else {
    res.status(405).json({ message: 'Method not allowed' });
  }
}
