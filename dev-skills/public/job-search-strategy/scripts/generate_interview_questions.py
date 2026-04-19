#!/usr/bin/env python3
"""
Generate targeted interview questions to elicit skill matches between candidate and job requirements.
Helps uncover both obvious and non-obvious qualifications.
"""

import json
import sys
from typing import List, Dict

def generate_skill_discovery_questions(job_analysis: Dict) -> Dict[str, List[str]]:
    """Generate questions to discover candidate's relevant skills."""
    
    questions = {
        'technical_skills': [],
        'soft_skills': [],
        'experience_validation': [],
        'culture_fit': [],
        'hidden_qualifications': []
    }
    
    # Technical skill discovery
    if job_analysis.get('skills', {}).get('technical'):
        for category, skills in job_analysis['skills']['technical'].items():
            if category == 'programming':
                questions['technical_skills'].extend([
                    f"Which of these technologies have you worked with: {', '.join(skills[:5])}?",
                    "Can you describe a complex project you built using any of these technologies?",
                    "What's your strongest programming language and why?"
                ])
            elif category == 'cloud':
                questions['technical_skills'].extend([
                    "Tell me about your experience with cloud platforms and infrastructure as code",
                    "Have you designed or implemented cloud architectures? At what scale?",
                    "What cloud certifications do you have or are pursuing?"
                ])
            elif category == 'data':
                questions['technical_skills'].extend([
                    "What's the largest dataset you've worked with and how did you process it?",
                    "Describe your experience with machine learning or data analytics projects",
                    "Which data visualization tools are you most comfortable with?"
                ])
    
    # Soft skill discovery
    questions['soft_skills'] = [
        "Describe a time when you had to learn a completely new technology or skill quickly. How did you approach it?",
        "Tell me about a project where you had to collaborate with people from different departments or backgrounds",
        "How do you handle ambiguous requirements or changing priorities?",
        "Give an example of when you had to explain a technical concept to non-technical stakeholders",
        "Describe a situation where you disagreed with a team decision. How did you handle it?"
    ]
    
    # Experience validation based on requirements
    if job_analysis.get('requirements', {}).get('years_experience'):
        years = job_analysis['requirements']['years_experience']
        questions['experience_validation'].extend([
            f"You mentioned {years}+ years of experience is required. Can you walk me through your relevant experience?",
            "What's the most complex/impactful project you've led or contributed to significantly?",
            "How has your approach to problem-solving evolved over your career?"
        ])
    
    # Culture fit questions based on signals
    if job_analysis.get('culture_signals'):
        for culture_type, signals in job_analysis['culture_signals'].items():
            if culture_type == 'startup_culture':
                questions['culture_fit'].extend([
                    "How comfortable are you with wearing multiple hats and unclear job boundaries?",
                    "Describe a time when you had to figure things out with minimal guidance",
                    "How do you prioritize when everything seems urgent?"
                ])
            elif culture_type == 'corporate_culture':
                questions['culture_fit'].extend([
                    "How do you approach working with multiple stakeholders with competing priorities?",
                    "Describe your experience with formal processes and documentation",
                    "How do you ensure compliance and governance in your work?"
                ])
            elif culture_type == 'innovation_focused':
                questions['culture_fit'].extend([
                    "What's the most innovative solution you've developed to solve a problem?",
                    "How do you stay current with emerging technologies and trends?",
                    "Describe a time when you challenged the status quo"
                ])
    
    # Hidden qualification discovery
    questions['hidden_qualifications'] = [
        "What unique experiences or skills do you have that might not be obvious from your resume?",
        "Have you worked in any industries similar to ours, even if in a different role?",
        "What side projects or personal interests might be relevant to this position?",
        "Have you mentored others or led informal initiatives that demonstrate leadership?",
        "What transferable skills from previous roles could add unique value here?",
        "Do you have any domain knowledge that might give you an edge in understanding our customers/market?",
        "Have you contributed to open source, written technical blogs, or given talks?",
        "What professional networks or communities are you part of that could benefit this role?"
    ]
    
    return questions

def generate_gap_analysis_questions(job_requirements: List[str], candidate_skills: List[str] = None) -> List[str]:
    """Generate questions to identify and address skill gaps."""
    
    questions = [
        "Looking at the job requirements, which areas do you feel most confident in?",
        "Are there any required skills you're currently learning or planning to learn?",
        "How quickly have you picked up new technologies in the past?",
        "What's your strategy for filling any skill gaps you might have?",
        "Can you give examples of how you've successfully transitioned to new technologies or domains?",
        "What resources do you typically use to learn new skills (courses, documentation, mentors, etc.)?",
        "How would you prioritize learning the skills you don't currently have?",
        "Are there similar technologies or concepts you know that would help you quickly learn the required ones?"
    ]
    
    return questions

def generate_competitive_advantage_questions() -> List[str]:
    """Generate questions to identify what makes this candidate unique."""
    
    return [
        "What would your colleagues say is your superpower?",
        "What do you bring to the table that other candidates might not?",
        "Describe a time when you solved a problem in an unconventional way",
        "What aspects of your background make you uniquely suited for this role?",
        "How has your diverse experience prepared you for this position?",
        "What passionate interests or hobbies give you a unique perspective?",
        "What's something you're exceptionally good at that might not be obvious?",
        "How would you differentiate yourself from someone with a similar resume?"
    ]

def create_interview_guide(job_analysis: Dict) -> Dict:
    """Create a comprehensive interview guide based on job analysis."""
    
    guide = {
        'opening': [
            "Let's start by understanding your background and what attracted you to this role",
            "Walk me through your career journey and what led you here"
        ],
        'skill_discovery': generate_skill_discovery_questions(job_analysis),
        'gap_analysis': generate_gap_analysis_questions([]),
        'competitive_advantage': generate_competitive_advantage_questions(),
        'closing': [
            "Based on what you know about the role, how would you add value in the first 90 days?",
            "What questions do you have about the role or company?",
            "Is there anything else you'd like me to know about your qualifications?",
            "What are your salary expectations and timeline for making a decision?"
        ],
        'follow_ups': {
            'for_weak_answers': [
                "Can you elaborate on that with a specific example?",
                "How did you measure success in that situation?",
                "What would you do differently if faced with that situation again?"
            ],
            'for_strong_answers': [
                "That's impressive. What was the impact of that work?",
                "How could you apply that experience to this role?",
                "What did you learn from that experience?"
            ]
        }
    }
    
    return guide

def main():
    """Generate interview questions based on job analysis."""
    
    if len(sys.argv) < 2:
        print("Usage: python generate_interview_questions.py <job_analysis.json>")
        print("First run: python analyze_job_posting.py <job_posting> > analysis.json")
        print("Then run: python generate_interview_questions.py analysis.json")
        sys.exit(1)
    
    # Read job analysis
    with open(sys.argv[1], 'r') as f:
        job_analysis = json.load(f)
    
    # Generate interview guide
    interview_guide = create_interview_guide(job_analysis)
    
    # Output results
    print(json.dumps(interview_guide, indent=2))
    
    return interview_guide

if __name__ == "__main__":
    main()
