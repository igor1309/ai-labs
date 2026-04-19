#!/usr/bin/env python3
"""
Analyze a job posting to extract both obvious and hidden insights.
This script helps identify key requirements, company culture signals, and strategic opportunities.
"""

import sys
import json
import re
from typing import Dict, List, Set

def extract_skills(text: str) -> Dict[str, List[str]]:
    """Extract technical and soft skills from job posting text."""
    
    # Common technical skill patterns
    tech_patterns = {
        'programming': r'\b(?:Python|Java|JavaScript|C\+\+|Ruby|Go|Rust|TypeScript|PHP|Swift|Kotlin|R|Scala|SQL|HTML|CSS|React|Angular|Vue|Node\.js|Django|Flask|Spring|\.NET|Rails)\b',
        'cloud': r'\b(?:AWS|Azure|GCP|Google Cloud|Kubernetes|Docker|Terraform|CloudFormation|Lambda|EC2|S3)\b',
        'data': r'\b(?:machine learning|ML|AI|data science|analytics|BigQuery|Spark|Hadoop|Tableau|PowerBI|ETL|data pipeline)\b',
        'tools': r'\b(?:Git|GitHub|GitLab|Bitbucket|JIRA|Confluence|Jenkins|CircleCI|Travis|Agile|Scrum|DevOps|CI/CD)\b',
        'databases': r'\b(?:MySQL|PostgreSQL|MongoDB|Redis|Elasticsearch|Oracle|SQL Server|DynamoDB|Cassandra)\b'
    }
    
    # Soft skill patterns
    soft_patterns = {
        'leadership': r'\b(?:lead|leadership|mentor|manage|supervise|coordinate|delegate|strategic thinking|vision)\b',
        'communication': r'\b(?:communication|present|articulate|collaborate|cross-functional|stakeholder|written|verbal)\b',
        'problem_solving': r'\b(?:problem-solving|analytical|critical thinking|troubleshoot|debug|optimize|innovate)\b',
        'teamwork': r'\b(?:team player|collaborative|cooperation|interpersonal|relationship building)\b',
        'adaptability': r'\b(?:adaptable|flexible|fast-paced|dynamic|change|ambiguity|learning|growth mindset)\b'
    }
    
    results = {
        'technical': {},
        'soft': {}
    }
    
    text_lower = text.lower()
    
    # Extract technical skills
    for category, pattern in tech_patterns.items():
        matches = re.findall(pattern, text, re.IGNORECASE)
        if matches:
            results['technical'][category] = list(set(matches))
    
    # Extract soft skills
    for category, pattern in soft_patterns.items():
        if re.search(pattern, text_lower):
            results['soft'][category] = True
            
    return results

def analyze_requirements(text: str) -> Dict[str, any]:
    """Analyze job requirements and categorize them by importance."""
    
    # Patterns to identify requirement levels
    must_have_patterns = [
        r'required|must have|essential|mandatory|minimum',
        r'bachelor\'s degree required',
        r'\d\+ years? (?:of )?experience required'
    ]
    
    nice_to_have_patterns = [
        r'preferred|desirable|plus|bonus|ideal|nice to have',
        r'experience with .+ (?:is a plus|would be beneficial)',
        r'familiarity with'
    ]
    
    sections = text.split('\n\n')
    requirements = {
        'must_have': [],
        'nice_to_have': [],
        'years_experience': None,
        'education_level': None
    }
    
    # Extract years of experience
    exp_match = re.search(r'(\d\+)\+?\s*years?', text, re.IGNORECASE)
    if exp_match:
        requirements['years_experience'] = exp_match.group(1)
    
    # Extract education requirements
    if re.search(r'bachelor|BS|BA', text, re.IGNORECASE):
        requirements['education_level'] = 'Bachelor\'s'
    elif re.search(r'master|MS|MA|MBA', text, re.IGNORECASE):
        requirements['education_level'] = 'Master\'s'
    elif re.search(r'PhD|doctorate', text, re.IGNORECASE):
        requirements['education_level'] = 'PhD'
    
    return requirements

def identify_culture_signals(text: str) -> Dict[str, List[str]]:
    """Identify company culture signals from job posting language."""
    
    culture_indicators = {
        'startup_culture': [
            'fast-paced', 'wear many hats', 'startup', 'entrepreneurial',
            'scrappy', 'build from scratch', 'ambiguity', 'ownership'
        ],
        'corporate_culture': [
            'enterprise', 'Fortune 500', 'established', 'structured',
            'process-oriented', 'governance', 'compliance', 'stakeholder management'
        ],
        'innovation_focused': [
            'innovative', 'cutting-edge', 'disrupt', 'transform',
            'pioneer', 'breakthrough', 'next-generation', 'revolutionary'
        ],
        'work_life_balance': [
            'work-life balance', 'flexible', 'remote', 'hybrid',
            'unlimited PTO', 'wellness', 'mental health', 'family-friendly'
        ],
        'performance_driven': [
            'results-oriented', 'high-performing', 'ambitious', 'driven',
            'exceed expectations', 'top performer', 'competitive', 'meritocracy'
        ]
    }
    
    text_lower = text.lower()
    detected_culture = {}
    
    for culture_type, keywords in culture_indicators.items():
        found_keywords = [kw for kw in keywords if kw in text_lower]
        if found_keywords:
            detected_culture[culture_type] = found_keywords
    
    return detected_culture

def identify_hidden_insights(text: str) -> Dict[str, any]:
    """Extract non-obvious insights from job posting."""
    
    insights = {
        'urgency_level': 'normal',
        'team_size_hints': [],
        'growth_stage': None,
        'red_flags': [],
        'opportunities': []
    }
    
    text_lower = text.lower()
    
    # Detect urgency
    if any(word in text_lower for word in ['immediate', 'asap', 'urgent', 'quickly']):
        insights['urgency_level'] = 'high'
        insights['opportunities'].append('Position may have less competition due to urgent need')
    
    # Team size hints
    if 'first hire' in text_lower or 'founding member' in text_lower:
        insights['team_size_hints'].append('Very early stage - you would be a founding team member')
        insights['opportunities'].append('Opportunity to shape the role and have significant impact')
    elif 'small team' in text_lower or 'close-knit' in text_lower:
        insights['team_size_hints'].append('Small team environment')
    elif 'large team' in text_lower or 'cross-functional teams' in text_lower:
        insights['team_size_hints'].append('Large organization with multiple teams')
    
    # Growth stage
    if 'series a' in text_lower or 'series b' in text_lower:
        insights['growth_stage'] = 'Early-stage startup'
    elif 'ipo' in text_lower or 'public company' in text_lower:
        insights['growth_stage'] = 'Public company'
    elif 'scaling' in text_lower or 'hypergrowth' in text_lower:
        insights['growth_stage'] = 'Rapid growth phase'
    
    # Red flags
    if 'other duties as assigned' in text_lower:
        insights['red_flags'].append('Vague responsibilities - role may lack clear definition')
    if 'rockstar' in text_lower or 'ninja' in text_lower or 'guru' in text_lower:
        insights['red_flags'].append('Potentially unrealistic expectations or immature culture')
    if re.search(r'24/7|always on|nights and weekends', text_lower):
        insights['red_flags'].append('Possible work-life balance concerns')
    
    # Opportunities
    if 'greenfield' in text_lower or 'build from scratch' in text_lower:
        insights['opportunities'].append('Chance to build something new without legacy constraints')
    if 'remote' in text_lower or 'distributed' in text_lower:
        insights['opportunities'].append('Remote work flexibility')
    if 'equity' in text_lower or 'stock options' in text_lower:
        insights['opportunities'].append('Equity compensation potential')
    
    return insights

def generate_strategic_recommendations(analysis: Dict) -> List[str]:
    """Generate strategic recommendations based on job analysis."""
    
    recommendations = []
    
    # Based on culture signals
    if 'startup_culture' in analysis['culture_signals']:
        recommendations.append("Emphasize adaptability and ability to work independently")
        recommendations.append("Highlight examples of building things from scratch or wearing multiple hats")
    
    if 'corporate_culture' in analysis['culture_signals']:
        recommendations.append("Demonstrate experience with structured processes and stakeholder management")
        recommendations.append("Emphasize professionalism and attention to detail in application materials")
    
    # Based on urgency
    if analysis['hidden_insights']['urgency_level'] == 'high':
        recommendations.append("Apply immediately - the position likely needs to be filled quickly")
        recommendations.append("Be prepared for a potentially accelerated interview process")
    
    # Based on technical requirements
    if analysis['skills']['technical']:
        tech_categories = list(analysis['skills']['technical'].keys())
        if len(tech_categories) > 3:
            recommendations.append("This is a broad role - emphasize your versatility and learning ability")
        else:
            recommendations.append(f"Deep expertise in {', '.join(tech_categories[:2])} appears most critical")
    
    # Based on team size
    if analysis['hidden_insights']['team_size_hints']:
        if 'founding team member' in ' '.join(analysis['hidden_insights']['team_size_hints']):
            recommendations.append("Research the founders and company vision thoroughly")
            recommendations.append("Prepare to discuss long-term vision and strategic thinking")
    
    return recommendations

def main():
    """Main function to analyze job posting."""
    
    if len(sys.argv) < 2:
        print("Usage: python analyze_job_posting.py <job_posting_file>")
        print("Or pipe content: echo 'job description' | python analyze_job_posting.py -")
        sys.exit(1)
    
    # Read job posting text
    if sys.argv[1] == '-':
        text = sys.stdin.read()
    else:
        with open(sys.argv[1], 'r') as f:
            text = f.read()
    
    # Perform analysis
    analysis = {
        'skills': extract_skills(text),
        'requirements': analyze_requirements(text),
        'culture_signals': identify_culture_signals(text),
        'hidden_insights': identify_hidden_insights(text)
    }
    
    # Add strategic recommendations
    analysis['strategic_recommendations'] = generate_strategic_recommendations(analysis)
    
    # Output results
    print(json.dumps(analysis, indent=2))
    
    return analysis

if __name__ == "__main__":
    main()
